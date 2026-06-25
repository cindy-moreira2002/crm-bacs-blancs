"use client";

import { useState, useEffect } from "react";
import type { Lead } from "@/lib/actions";
import LeadCard from "./LeadCard";
import LeadForm from "./LeadForm";

const columns = [
  {
    key: "Contact direct",
    label: "Contact direct",
    description: "Email ou téléphone dispo",
    dot: "bg-green-500",
    headerBg: "bg-green-50 border-green-200",
  },
  {
    key: "Site web",
    label: "Site web",
    description: "Site perso avec formulaire",
    dot: "bg-purple-500",
    headerBg: "bg-purple-50 border-purple-200",
  },
  {
    key: "Annuaire",
    label: "Annuaire",
    description: "PagesJaunes, VosCours, Apprentus...",
    dot: "bg-yellow-500",
    headerBg: "bg-yellow-50 border-yellow-200",
  },
  {
    key: "LinkedIn",
    label: "LinkedIn",
    description: "Profil LinkedIn identifié",
    dot: "bg-blue-500",
    headerBg: "bg-blue-50 border-blue-200",
  },
  {
    key: "Superprof",
    label: "Superprof",
    description: "Annonce Superprof",
    dot: "bg-orange-500",
    headerBg: "bg-orange-50 border-orange-200",
  },
];

const knownKeys = new Set(columns.map((c) => c.key));

export default function KanbanBoard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchLocal, setSearchLocal] = useState("");

  async function fetchLeads() {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data);
    setLoading(false);
  }

  useEffect(() => { fetchLeads(); }, []);

  function handleFormClose() {
    setShowForm(false);
    fetchLeads();
  }

  const filtered = searchLocal.trim()
    ? leads.filter((l) => {
        const q = searchLocal.toLowerCase();
        return (
          l.firstName.toLowerCase().includes(q) ||
          l.lastName.toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q) ||
          (l.phone || "").toLowerCase().includes(q) ||
          l.subject.toLowerCase().includes(q) ||
          (l.city || "").toLowerCase().includes(q) ||
          (l.notes || "").toLowerCase().includes(q)
        );
      })
    : leads;

  const grouped = new Map<string, Lead[]>();
  for (const col of columns) grouped.set(col.key, []);
  grouped.set("Autre", []);

  for (const lead of filtered) {
    const src = lead.source || "";
    if (knownKeys.has(src)) {
      grouped.get(src)!.push(lead);
    } else {
      grouped.get("Autre")!.push(lead);
    }
  }

  const autreLeads = grouped.get("Autre")!;

  const allColumns = [
    ...columns,
    ...(autreLeads.length > 0
      ? [{
          key: "Autre",
          label: "Autre",
          description: "Non catégorisé",
          dot: "bg-gray-400",
          headerBg: "bg-gray-50 border-gray-200",
        }]
      : []),
  ];

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">
        <div className="text-4xl mb-3 animate-pulse">...</div>
        <p>Chargement des leads...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Rechercher un lead..."
            value={searchLocal}
            onChange={(e) => setSearchLocal(e.target.value)}
            className="w-full border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <div className="text-sm text-gray-400">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
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

      <div className="flex gap-4 overflow-x-auto pb-6 -mx-4 px-4 sm:-mx-6 sm:px-6">
        {allColumns.map((col) => {
          const colLeads = grouped.get(col.key) || [];
          return (
            <div key={col.key} className="flex-shrink-0 w-80">
              <div className={`rounded-t-xl px-4 py-3 border border-b-0 ${col.headerBg}`}>
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <h2 className="font-semibold text-sm text-gray-900">{col.label}</h2>
                  <span className="ml-auto bg-white text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full shadow-sm">
                    {colLeads.length}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{col.description}</p>
              </div>
              <div className="bg-gray-50/80 rounded-b-xl border border-t-0 border-gray-200 p-3 space-y-3 min-h-[200px] max-h-[calc(100vh-300px)] overflow-y-auto">
                {colLeads.length === 0 ? (
                  <p className="text-center text-xs text-gray-400 py-12">Aucun lead</p>
                ) : (
                  colLeads.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showForm && <LeadForm onClose={handleFormClose} />}
    </>
  );
}
