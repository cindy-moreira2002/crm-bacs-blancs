"use server";

import { dbAll, dbGet, dbRun, isPostgres } from "@/lib/db";
import { revalidatePath } from "next/cache";
import crypto from "crypto";

export type Lead = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  subject: string;
  city: string | null;
  status: string;
  lastContactDate: string | null;
  notes: string | null;
  source: string | null;
  contactLink: string | null;
  contacted: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LeadFormData = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  subject: string;
  city?: string;
  status: string;
  lastContactDate?: string;
  notes?: string;
  source?: string;
  contactLink?: string;
};

export async function getLeads(
  search?: string,
  status?: string,
  source?: string,
  contacted?: string
): Promise<Lead[]> {
  const params: string[] = [];

  let sqliteSql = 'SELECT * FROM "Lead" WHERE 1=1';
  let pgSql = 'SELECT * FROM "Lead" WHERE 1=1';
  let paramIdx = 1;

  if (status && status !== "tous") {
    sqliteSql += " AND status = ?";
    pgSql += ` AND status = $${paramIdx++}`;
    params.push(status);
  }

  if (source && source !== "tous") {
    sqliteSql += " AND source = ?";
    pgSql += ` AND source = $${paramIdx++}`;
    params.push(source);
  }

  if (contacted === "oui" || contacted === "non") {
    sqliteSql += ` AND contacted = ?`;
    pgSql += ` AND contacted = $${paramIdx++}`;
    params.push(contacted === "oui" ? "1" : "0");
  }

  if (search) {
    const like = `%${search}%`;
    sqliteSql +=
      ' AND ("firstName" LIKE ? OR "lastName" LIKE ? OR email LIKE ? OR phone LIKE ? OR subject LIKE ? OR city LIKE ?)';
    pgSql += ` AND ("firstName" ILIKE $${paramIdx++} OR "lastName" ILIKE $${paramIdx++} OR email ILIKE $${paramIdx++} OR phone ILIKE $${paramIdx++} OR subject ILIKE $${paramIdx++} OR city ILIKE $${paramIdx++})`;
    params.push(like, like, like, like, like, like);
  }

  sqliteSql += ' ORDER BY "updatedAt" DESC';
  pgSql += ' ORDER BY "updatedAt" DESC';

  const rows = await dbAll(sqliteSql, pgSql, params);
  return rows.map((r) => ({ ...r, contacted: !!r.contacted })) as Lead[];
}

export async function getLead(id: string): Promise<Lead | undefined> {
  const row = (await dbGet(
    'SELECT * FROM "Lead" WHERE id = ?',
    'SELECT * FROM "Lead" WHERE id = $1',
    [id]
  )) as Record<string, unknown> | undefined;
  return row ? ({ ...row, contacted: !!row.contacted } as Lead) : undefined;
}

export async function createLead(data: LeadFormData) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const now = new Date().toISOString();
  const params = [
    id,
    data.firstName,
    data.lastName,
    data.email || null,
    data.phone || null,
    data.subject,
    data.city || null,
    data.status,
    data.lastContactDate || null,
    data.notes || null,
    data.source || null,
    data.contactLink || null,
    now,
    now,
  ];

  const cols =
    '(id, "firstName", "lastName", email, phone, subject, city, status, "lastContactDate", notes, source, "contactLink", "createdAt", "updatedAt")';

  await dbRun(
    `INSERT INTO "Lead" ${cols} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `INSERT INTO "Lead" ${cols} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    params
  );

  revalidatePath("/");
  return id;
}

export async function updateLead(id: string, data: LeadFormData) {
  const now = new Date().toISOString();
  const params = [
    data.firstName,
    data.lastName,
    data.email || null,
    data.phone || null,
    data.subject,
    data.city || null,
    data.status,
    data.lastContactDate || null,
    data.notes || null,
    data.source || null,
    data.contactLink || null,
    now,
    id,
  ];

  await dbRun(
    `UPDATE "Lead" SET "firstName"=?, "lastName"=?, email=?, phone=?, subject=?, city=?, status=?, "lastContactDate"=?, notes=?, source=?, "contactLink"=?, "updatedAt"=? WHERE id=?`,
    `UPDATE "Lead" SET "firstName"=$1, "lastName"=$2, email=$3, phone=$4, subject=$5, city=$6, status=$7, "lastContactDate"=$8, notes=$9, source=$10, "contactLink"=$11, "updatedAt"=$12 WHERE id=$13`,
    params
  );

  revalidatePath("/");
}

export async function toggleLeadContacted(id: string, contacted: boolean) {
  // Coché → "contacté", décoché → "nouveau". Ne touche PAS au subject (Matière),
  // donc pas d'exigence de matière ni d'écrasement d'un subject hors liste.
  const status = contacted ? "contacté" : "nouveau";
  await dbRun(
    'UPDATE "Lead" SET contacted=?, status=?, "updatedAt"=? WHERE id=?',
    'UPDATE "Lead" SET contacted=$1, status=$2, "updatedAt"=$3 WHERE id=$4',
    [contacted ? 1 : 0, status, new Date().toISOString(), id]
  );
  revalidatePath("/crm");
  revalidatePath("/");
}

/**
 * Marque contactés les leads dont l'email figure dans `emails` (ceux à qui elle
 * a écrit). Ne crée aucun lead : seuls les leads déjà présents sont cochés, et
 * leur statut passe de "nouveau" à "contacté". Retourne le nombre de leads touchés.
 */
export async function markContactedByEmails(
  emails: string[]
): Promise<{ matched: number }> {
  const normalized = Array.from(
    new Set(
      (emails || [])
        .map((e) => String(e || "").trim().toLowerCase())
        .filter((e) => e.includes("@") && e.length <= 320)
    )
  );
  if (normalized.length === 0) return { matched: 0 };

  const now = new Date().toISOString();
  let matched = 0;

  if (isPostgres) {
    const rows = await dbAll(
      "",
      `UPDATE "Lead"
         SET contacted = TRUE,
             status = CASE WHEN status = 'nouveau' THEN 'contacté' ELSE status END,
             "updatedAt" = $2
       WHERE lower(email) = ANY($1)
       RETURNING id`,
      [normalized, now]
    );
    matched = rows.length;
  } else {
    // SQLite (dev) : pas de tableau paramétrable, on découpe en lots d'IN(...).
    for (let i = 0; i < normalized.length; i += 400) {
      const chunk = normalized.slice(i, i + 400);
      const placeholders = chunk.map(() => "?").join(", ");
      const found = await dbAll(
        `SELECT id FROM "Lead" WHERE lower(email) IN (${placeholders})`,
        "",
        chunk
      );
      matched += found.length;
      await dbRun(
        `UPDATE "Lead"
           SET contacted = 1,
               status = CASE WHEN status = 'nouveau' THEN 'contacté' ELSE status END,
               "updatedAt" = ?
         WHERE lower(email) IN (${placeholders})`,
        "",
        [now, ...chunk]
      );
    }
  }

  revalidatePath("/crm");
  revalidatePath("/");
  return { matched };
}

export async function deleteLead(id: string) {
  await dbRun(
    'DELETE FROM "Lead" WHERE id = ?',
    'DELETE FROM "Lead" WHERE id = $1',
    [id]
  );
  revalidatePath("/");
}

export async function getStats() {
  const sqliteSql = `SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status='nouveau' THEN 1 ELSE 0 END) as nouveau,
    SUM(CASE WHEN status='contacté' THEN 1 ELSE 0 END) as contacte,
    SUM(CASE WHEN status='intéressé' THEN 1 ELSE 0 END) as interesse,
    SUM(CASE WHEN status='converti' THEN 1 ELSE 0 END) as converti,
    SUM(CASE WHEN status='perdu' THEN 1 ELSE 0 END) as perdu
  FROM "Lead"`;

  const pgSql = `SELECT
    COUNT(*)::int as total,
    COUNT(*) FILTER (WHERE status='nouveau')::int as nouveau,
    COUNT(*) FILTER (WHERE status='contacté')::int as contacte,
    COUNT(*) FILTER (WHERE status='intéressé')::int as interesse,
    COUNT(*) FILTER (WHERE status='converti')::int as converti,
    COUNT(*) FILTER (WHERE status='perdu')::int as perdu
  FROM "Lead"`;

  const row = (await dbGet(sqliteSql, pgSql)) as Record<string, number>;

  return {
    total: row?.total || 0,
    nouveau: row?.nouveau || 0,
    contacte: row?.contacte || 0,
    interesse: row?.interesse || 0,
    converti: row?.converti || 0,
    perdu: row?.perdu || 0,
  };
}

// ---------- Écoles partenaires ----------

export type PartnerSchool = {
  id: string;
  etablissement: string;
  ville: string | null;
  typeContact: string;
  nomContact: string | null;
  fonction: string | null;
  email: string | null;
  telephone: string | null;
  lien: string | null;
  statut: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartnerSchoolFormData = {
  etablissement: string;
  ville?: string;
  typeContact: string;
  nomContact?: string;
  fonction?: string;
  email?: string;
  telephone?: string;
  lien?: string;
  statut: string;
  notes?: string;
};

const DEFAULT_PARTNER_SCHOOLS: Omit<PartnerSchoolFormData, "statut">[] = [
  { etablissement: "Lycée Paul Bert", ville: "Paris 14e", typeContact: "FCPE", nomContact: "Conseil local FCPE", fonction: "Bureau parents d'élèves", email: "lycee.pbert.fcpe14@gmail.com", notes: "Email public du conseil local FCPE (source fcpe75.org)." },
  { etablissement: "Lycée Colbert", ville: "Paris 10e", typeContact: "FCPE", nomContact: "Conseil local FCPE Colbert", fonction: "Bureau parents d'élèves", email: "fcpe.colbert.paris@gmail.com", lien: "https://fcpecolbert.wordpress.com", notes: "27 rue du Château Landon. Site WordPress FCPE actif." },
  { etablissement: "Collège-Lycée Condorcet", ville: "Paris 8e/9e", typeContact: "PEEP", nomContact: "Association PEEP Condorcet", fonction: "Bureau parents d'élèves", email: "APE2773@peep.asso.fr", notes: "Adresse PEEP officielle de l'établissement." },
  { etablissement: "Cité scolaire Gabriel Fauré", ville: "Paris 13e", typeContact: "PEEP", nomContact: "Association PEEP Gabriel Fauré", fonction: "Bureau parents d'élèves", email: "peepgabrielfaureparis@gmail.com", notes: "Email public PEEP." },
  { etablissement: "Lycée Louis-le-Grand", ville: "Paris 5e", typeContact: "PEEP", nomContact: "Association PEEP LLG", fonction: "Bureau parents d'élèves", email: "peep-llg@peepllg.fr", lien: "https://peepllg.fr", notes: "Grand lycée prestigieux. Site PEEP dédié." },
  { etablissement: "Lycée Camille Sée", ville: "Paris 15e", typeContact: "PEEP", nomContact: "Association PEEP Camille Sée", fonction: "Bureau parents d'élèves", email: "peepcamillesee@gmail.com", notes: "Email public PEEP." },
  { etablissement: "Lycée Lavoisier", ville: "Paris 5e", typeContact: "PEEP", nomContact: "Association PEEP Lavoisier", fonction: "Bureau parents d'élèves", lien: "https://www.helloasso.com/associations/association-des-parents-d-eleves-de-l-enseignement-public-peep-du-college-et-du-lycee-lavoisier", notes: "Contact via page HelloAsso de l'association." },
  { etablissement: "FCPE Paris (départementale 75)", ville: "Paris", typeContact: "Fédération", nomContact: "FCPE 75", fonction: "Fédération départementale", lien: "https://www.fcpe75.org/sites-des-conseils-locaux/", notes: "Annuaire de tous les conseils locaux FCPE par arrondissement — point d'entrée pour d'autres lycées." },
  { etablissement: "PEEP nationale", ville: "Paris 13e (92 av. d'Ivry)", typeContact: "Fédération", nomContact: "Fédération PEEP", fonction: "Siège / Prés. Emmanuel Garot", telephone: "+33 1 44 15 18 18", lien: "https://peep.asso.fr/contact/", notes: "Siège national PEEP. Oriente vers assos locales." },
  { etablissement: "FCPE nationale", ville: "Paris", typeContact: "Fédération", nomContact: "Fédération FCPE", fonction: "Siège national", lien: "https://www.fcpe.asso.fr/contact", notes: "Point de contact fédéral national FCPE." },
];

export async function seedPartnerSchoolsIfEmpty() {
  const row = (await dbGet(
    'SELECT COUNT(*) as c FROM "PartnerSchool"',
    'SELECT COUNT(*)::int as c FROM "PartnerSchool"'
  )) as { c: number } | undefined;
  if (row && Number(row.c) > 0) return;
  const cols =
    '(id, etablissement, ville, "typeContact", "nomContact", fonction, email, telephone, lien, statut, notes, "createdAt", "updatedAt")';
  for (const s of DEFAULT_PARTNER_SCHOOLS) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO "PartnerSchool" ${cols} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      `INSERT INTO "PartnerSchool" ${cols} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        id,
        s.etablissement,
        s.ville || null,
        s.typeContact,
        s.nomContact || null,
        s.fonction || null,
        s.email || null,
        s.telephone || null,
        s.lien || null,
        "à contacter",
        s.notes || null,
        now,
        now,
      ]
    );
  }
}

export async function getPartnerSchools(): Promise<PartnerSchool[]> {
  return (await dbAll(
    'SELECT * FROM "PartnerSchool" ORDER BY etablissement ASC',
    'SELECT * FROM "PartnerSchool" ORDER BY etablissement ASC',
    []
  )) as PartnerSchool[];
}

export async function createPartnerSchool(data: PartnerSchoolFormData) {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
  const now = new Date().toISOString();
  const cols =
    '(id, etablissement, ville, "typeContact", "nomContact", fonction, email, telephone, lien, statut, notes, "createdAt", "updatedAt")';
  const params = [
    id,
    data.etablissement,
    data.ville || null,
    data.typeContact,
    data.nomContact || null,
    data.fonction || null,
    data.email || null,
    data.telephone || null,
    data.lien || null,
    data.statut,
    data.notes || null,
    now,
    now,
  ];
  await dbRun(
    `INSERT INTO "PartnerSchool" ${cols} VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `INSERT INTO "PartnerSchool" ${cols} VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    params
  );
  revalidatePath("/ecoles-partenaires");
  return id;
}

export async function updatePartnerSchoolStatut(id: string, statut: string) {
  await dbRun(
    'UPDATE "PartnerSchool" SET statut=?, "updatedAt"=? WHERE id=?',
    'UPDATE "PartnerSchool" SET statut=$1, "updatedAt"=$2 WHERE id=$3',
    [statut, new Date().toISOString(), id]
  );
  revalidatePath("/ecoles-partenaires");
}

export async function deletePartnerSchool(id: string) {
  await dbRun(
    'DELETE FROM "PartnerSchool" WHERE id = ?',
    'DELETE FROM "PartnerSchool" WHERE id = $1',
    [id]
  );
  revalidatePath("/ecoles-partenaires");
}
