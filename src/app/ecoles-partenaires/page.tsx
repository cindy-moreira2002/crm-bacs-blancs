import { getPartnerSchools, seedPartnerSchoolsIfEmpty } from "@/lib/actions";
import CrmNav from "@/components/CrmNav";

export const dynamic = "force-dynamic";

const TYPE_COLORS: Record<string, string> = {
  FCPE: "bg-blue-100 text-blue-700",
  PEEP: "bg-emerald-100 text-emerald-700",
  Direction: "bg-amber-100 text-amber-700",
  Fédération: "bg-purple-100 text-purple-700",
};

const STATUT_COLORS: Record<string, string> = {
  "à contacter": "bg-gray-100 text-gray-600",
  contacté: "bg-blue-100 text-blue-700",
  "en discussion": "bg-amber-100 text-amber-700",
  partenaire: "bg-emerald-100 text-emerald-700",
};

export default async function EcolesPartenairesPage() {
  await seedPartnerSchoolsIfEmpty();
  const contacts = await getPartnerSchools();

  return (
    <div className="min-h-screen bg-gray-50/30">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-full mx-auto px-4 sm:px-6 py-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              M
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">
                Démarchage écoles &amp; profs
              </h1>
              <p className="text-sm text-gray-500">
                Contacts lycées &mdash; assos de parents &amp; directions pour promouvoir les bacs blancs
              </p>
            </div>
          </div>
          <CrmNav />
        </div>
      </header>

      <main className="max-w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="text-sm text-gray-500">
          {contacts.length} contact{contacts.length > 1 ? "s" : ""} référencé
          {contacts.length > 1 ? "s" : ""}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3">Établissement</th>
                  <th className="text-left px-4 py-3">Ville</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Contact / fonction</th>
                  <th className="text-left px-4 py-3">Email</th>
                  <th className="text-left px-4 py-3">Tél.</th>
                  <th className="text-left px-4 py-3">Lien</th>
                  <th className="text-left px-4 py-3">Statut</th>
                  <th className="text-left px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50/60 align-top">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {c.etablissement}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.ville || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          TYPE_COLORS[c.typeContact] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.typeContact}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.nomContact || "—"}
                      {c.fonction ? (
                        <span className="block text-xs text-gray-400">
                          {c.fonction}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {c.email ? (
                        <a
                          href={`mailto:${c.email}`}
                          className="text-indigo-600 hover:underline break-all"
                        >
                          {c.email}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {c.telephone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {c.lien ? (
                        <a
                          href={c.lien}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-600 hover:underline"
                        >
                          ouvrir
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUT_COLORS[c.statut] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 max-w-xs">
                      {c.notes || "—"}
                    </td>
                  </tr>
                ))}
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                      Aucun contact pour le moment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
