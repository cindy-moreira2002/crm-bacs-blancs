import { getLeads, createLead, updateLead } from "@/lib/actions";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const status = url.searchParams.get("status") || undefined;
  const source = url.searchParams.get("source") || undefined;
  const contacted = url.searchParams.get("contacted") || undefined;
  const leads = await getLeads(search, status, source, contacted);
  return Response.json(leads);
}

export async function POST(request: Request) {
  const data = await request.json();

  if (!data.firstName || !data.lastName || !data.subject) {
    return Response.json(
      { error: "firstName, lastName et subject sont requis" },
      { status: 400 }
    );
  }

  const id = await createLead({
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    subject: data.subject,
    city: data.city,
    status: data.status || "nouveau",
    lastContactDate: data.lastContactDate,
    notes: data.notes,
    source: data.source,
    contactLink: data.contactLink,
  });

  return Response.json({ success: true, id }, { status: 201 });
}

export async function PUT(request: Request) {
  const data = await request.json();

  if (!data.id) {
    return Response.json({ error: "id est requis" }, { status: 400 });
  }

  await updateLead(data.id, {
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    phone: data.phone,
    subject: data.subject,
    city: data.city,
    status: data.status || "nouveau",
    lastContactDate: data.lastContactDate,
    notes: data.notes,
    source: data.source,
    contactLink: data.contactLink,
  });

  return Response.json({ success: true });
}
