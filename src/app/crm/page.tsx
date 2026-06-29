import { Suspense } from "react";
import { getLeads, getStats } from "@/lib/actions";
import StatsCards from "@/components/StatsCards";
import LeadTable from "@/components/LeadTable";
import Toolbar from "@/components/Toolbar";

type Props = {
  searchParams: Promise<{ search?: string; status?: string; source?: string }>;
};

export default async function CrmPage({ searchParams }: Props) {
  const params = await searchParams;
  const [leads, stats] = await Promise.all([
    getLeads(params.search, params.status || "tous", params.source || "tous"),
    getStats(),
  ]);

  return (
    <div className="min-h-screen">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-lg">
              M
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                CRM Bacs Blancs
              </h1>
              <p className="text-sm text-gray-500">
                Les Matinées du Bac &mdash; Gestion des leads
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <StatsCards stats={stats} />

        <Suspense fallback={null}>
          <Toolbar />
        </Suspense>

        <LeadTable leads={leads} />
      </main>
    </div>
  );
}
