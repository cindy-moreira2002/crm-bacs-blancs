"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import StatusBadge from "./StatusBadge";
import LeadForm from "./LeadForm";
import { deleteLead, toggleLeadContacted } from "@/lib/actions";

import type { Lead } from "@/lib/actions";

const sourceColors: Record<string, string> = {
  "Contact direct": "bg-green-100 text-green-700",
  LinkedIn: "bg-blue-100 text-blue-700",
  "LinkedIn EDHEC": "bg-indigo-100 text-indigo-700",
  Superprof: "bg-orange-100 text-orange-700",
  "Site web": "bg-purple-100 text-purple-700",
  Annuaire: "bg-yellow-100 text-yellow-700",
  Google: "bg-red-100 text-red-700",
  Facebook: "bg-sky-100 text-sky-700",
  Instagram: "bg-pink-100 text-pink-700",
};

export default function LeadTable({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contactedOverrides, setContactedOverrides] = useState<Record<string, boolean>>({});

  function handleDelete(id: string) {
    if (!confirm("Supprimer ce lead ?")) return;
    setDeletingId(id);
    startTransition(async () => {
      await deleteLead(id);
      setDeletingId(null);
    });
  }

  function handleToggleContacted(id: string, contacted: boolean) {
    setContactedOverrides((prev) => ({ ...prev, [id]: contacted }));
    startTransition(async () => {
      await toggleLeadContacted(id, contacted);
      router.refresh();
    });
  }

  if (leads.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-5xl mb-4">📋</div>
        <p className="text-lg">Aucun lead pour le moment</p>
        <p className="text-sm mt-1">Commence par ajouter ton premier contact !</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-gray-500 text-xs uppercase tracking-wider">
              <th className="px-4 py-3 font-medium">Contacté</th>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Matiere</th>
              <th className="px-4 py-3 font-medium">Ville</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Source</th>
              <th className="px-4 py-3 font-medium">Lien</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map((lead) => {
              const contacted = contactedOverrides[lead.id] ?? lead.contacted;
              return (
              <tr
                key={lead.id}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => setExpandedId(expandedId === lead.id ? null : lead.id)}
              >
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={contacted}
                    onChange={(e) => handleToggleContacted(lead.id, e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                    aria-label={`Marquer ${lead.firstName} ${lead.lastName} comme contacté`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">
                    {lead.firstName} {lead.lastName}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline block">
                      {lead.email}
                    </a>
                  )}
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} onClick={e => e.stopPropagation()} className="text-indigo-600 hover:underline block">
                      {lead.phone}
                    </a>
                  )}
                  {!lead.email && !lead.phone && <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">{lead.subject}</td>
                <td className="px-4 py-3 text-gray-600">{lead.city || "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={lead.status} />
                </td>
                <td className="px-4 py-3">
                  {lead.source ? (
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${sourceColors[lead.source] || "bg-gray-100 text-gray-600"}`}>
                      {lead.source}
                    </span>
                  ) : "—"}
                </td>
                <td className="px-4 py-3">
                  {lead.contactLink ? (
                    <a
                      href={lead.contactLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Ouvrir
                    </a>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setEditingLead(lead)}
                      className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => handleDelete(lead.id)}
                      disabled={isPending && deletingId === lead.id}
                      className="text-red-500 hover:text-red-700 text-xs font-medium disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingLead && (
        <LeadForm lead={editingLead} onClose={() => setEditingLead(null)} />
      )}
    </>
  );
}
