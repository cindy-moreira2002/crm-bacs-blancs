"use client";

import { useState, useTransition } from "react";
import { deleteLead, toggleLeadContacted } from "@/lib/actions";
import type { Lead } from "@/lib/actions";
import StatusBadge from "./StatusBadge";
import LeadForm from "./LeadForm";

export default function LeadCard({ lead }: { lead: Lead }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [contacted, setContacted] = useState(lead.contacted);
  const [status, setStatus] = useState(lead.status);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Supprimer ${lead.firstName} ${lead.lastName} ?`)) return;
    startTransition(() => deleteLead(lead.id));
  }

  function handleToggleContacted(checked: boolean) {
    setContacted(checked); // optimiste
    setStatus(checked ? "contacté" : "nouveau");
    startTransition(() => toggleLeadContacted(lead.id, checked));
  }

  const hasContact = lead.email || lead.phone;
  const domain = lead.contactLink
    ? (() => { try { return new URL(lead.contactLink).hostname.replace("www.", ""); } catch { return null; } })()
    : null;

  return (
    <>
      <div
        className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-gray-900 text-sm leading-tight">
            {lead.firstName} {lead.lastName}
          </h3>
          <StatusBadge status={status} />
        </div>

        <label
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 mb-3 cursor-pointer select-none w-fit"
        >
          <input
            type="checkbox"
            checked={contacted}
            disabled={isPending}
            onChange={(e) => handleToggleContacted(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
          />
          <span className="text-xs font-medium text-gray-600">Contacté</span>
        </label>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-medium">
            {lead.subject}
          </span>
          {lead.city && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 text-xs">
              {lead.city}
            </span>
          )}
        </div>

        {hasContact && (
          <div className="space-y-1 mb-3">
            {lead.email && (
              <a
                href={`mailto:${lead.email}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                {lead.email}
              </a>
            )}
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 hover:underline"
              >
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                {lead.phone}
              </a>
            )}
          </div>
        )}

        {lead.contactLink && (
          <a
            href={lead.contactLink}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-800 hover:underline mb-3"
          >
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            {domain || "Ouvrir le lien"}
          </a>
        )}

        {expanded && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            {lead.notes && (
              <p className="text-xs text-gray-500 mb-3 whitespace-pre-wrap">{lead.notes}</p>
            )}
            <div className="text-xs text-gray-400 mb-3">
              Ajouté le {new Date(lead.createdAt).toLocaleDateString("fr-FR")}
              {lead.lastContactDate && (
                <> &middot; Dernier contact : {new Date(lead.lastContactDate).toLocaleDateString("fr-FR")}</>
              )}
            </div>
            <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setEditing(true)}
                className="flex-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 rounded-lg py-1.5 transition-colors"
              >
                Modifier
              </button>
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="flex-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg py-1.5 transition-colors disabled:opacity-50"
              >
                Supprimer
              </button>
            </div>
          </div>
        )}
      </div>

      {editing && <LeadForm lead={lead} onClose={() => setEditing(false)} />}
    </>
  );
}
