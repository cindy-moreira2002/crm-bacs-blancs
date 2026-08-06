/**
 * Synchronisation des leads déclenchée par un service, pas par un humain.
 *
 * Ce module vit HORS de `lib/actions.ts` volontairement. `actions.ts` porte la
 * directive `"use server"` : tout ce qu'il exporte devient une action serveur,
 * c'est-à-dire un point d'entrée POST appelable par n'importe qui connaissant
 * son identifiant — lisible dans le bundle client. Ces exports-là exigent
 * désormais un compte administratrice.
 *
 * Or cette fonction-ci est appelée par Apps Script (scan de la boîte Gmail),
 * qui n'a pas de session : il s'authentifie avec le jeton partagé
 * GMAIL_SYNC_TOKEN vérifié dans /api/gmail-contacted. La sortir d'`actions.ts`
 * lui évite d'être exposée en action publique tout en gardant la route
 * fonctionnelle.
 */
import { revalidatePath } from "next/cache";
import { dbAll, dbRun, isPostgres } from "@/lib/db";

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
