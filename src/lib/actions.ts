"use server";

import { dbAll, dbGet, dbRun } from "@/lib/db";
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
  source?: string
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

  if (search) {
    const like = `%${search}%`;
    sqliteSql +=
      ' AND ("firstName" LIKE ? OR "lastName" LIKE ? OR email LIKE ? OR phone LIKE ? OR subject LIKE ? OR city LIKE ?)';
    pgSql += ` AND ("firstName" ILIKE $${paramIdx++} OR "lastName" ILIKE $${paramIdx++} OR email ILIKE $${paramIdx++} OR phone ILIKE $${paramIdx++} OR subject ILIKE $${paramIdx++} OR city ILIKE $${paramIdx++})`;
    params.push(like, like, like, like, like, like);
  }

  sqliteSql += ' ORDER BY "updatedAt" DESC';
  pgSql += ' ORDER BY "updatedAt" DESC';

  return (await dbAll(sqliteSql, pgSql, params)) as Lead[];
}

export async function getLead(id: string): Promise<Lead | undefined> {
  return (await dbGet(
    'SELECT * FROM "Lead" WHERE id = ?',
    'SELECT * FROM "Lead" WHERE id = $1',
    [id]
  )) as Lead | undefined;
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
