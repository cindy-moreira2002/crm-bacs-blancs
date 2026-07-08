import { markContactedByEmails } from "@/lib/actions";

// Appelé par Apps Script (scan des emails envoyés) pour cocher "Contacté"
// les leads déjà présents dans le CRM. Protégé par un jeton partagé.
export async function POST(request: Request) {
  const token = process.env.GMAIL_SYNC_TOKEN;
  const provided = (request.headers.get("authorization") || "").replace(
    /^Bearer\s+/i,
    ""
  );
  if (!token || provided !== token) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { emails?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const emails = Array.isArray(body.emails)
    ? (body.emails as unknown[]).map((e) => String(e))
    : [];
  if (emails.length === 0) {
    return Response.json({ error: "emails[] requis" }, { status: 400 });
  }

  const { matched } = await markContactedByEmails(emails);
  return Response.json({ success: true, received: emails.length, matched });
}
