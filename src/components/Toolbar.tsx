"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LeadForm from "./LeadForm";

const statuses = [
  { value: "tous", label: "Tous" },
  { value: "nouveau", label: "Nouveaux" },
  { value: "contacté", label: "Contactés" },
  { value: "intéressé", label: "Intéressés" },
  { value: "converti", label: "Convertis" },
  { value: "perdu", label: "Perdus" },
];

const sourceFilters = [
  { value: "tous", label: "Toutes sources" },
  { value: "Contact direct", label: "Contact direct" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "LinkedIn EDHEC", label: "LinkedIn EDHEC" },
  { value: "Superprof", label: "Superprof" },
  { value: "Site web", label: "Site web" },
  { value: "Annuaire", label: "Annuaire" },
];

export default function Toolbar() {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentStatus = searchParams.get("status") || "tous";
  const currentSource = searchParams.get("source") || "tous";
  const currentContacted = searchParams.get("contacted") || "tous";
  const currentSearch = searchParams.get("search") || "";

  function updateParams(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "tous") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/?${params.toString()}`);
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="relative">
            <input
              type="text"
              placeholder="Rechercher un lead..."
              defaultValue={currentSearch}
              onChange={(e) => {
                const timeout = setTimeout(
                  () => updateParams("search", e.target.value),
                  300
                );
                return () => clearTimeout(timeout);
              }}
              className="border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm w-full sm:w-64 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Ajouter un lead
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex gap-1 flex-wrap">
            <span className="text-xs text-gray-400 self-center mr-1">Contact:</span>
            {[
              { value: "tous", label: "Tous" },
              { value: "non", label: "Pas contactés" },
              { value: "oui", label: "Contactés" },
            ].map((c) => (
              <button
                key={c.value}
                onClick={() => updateParams("contacted", c.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentContacted === c.value
                    ? "bg-teal-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap sm:ml-4">
            <span className="text-xs text-gray-400 self-center mr-1">Statut:</span>
            {statuses.map((s) => (
              <button
                key={s.value}
                onClick={() => updateParams("status", s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentStatus === s.value
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap sm:ml-4">
            <span className="text-xs text-gray-400 self-center mr-1">Source:</span>
            {sourceFilters.map((s) => (
              <button
                key={s.value}
                onClick={() => updateParams("source", s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  currentSource === s.value
                    ? "bg-emerald-600 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showForm && <LeadForm onClose={() => setShowForm(false)} />}
    </>
  );
}
