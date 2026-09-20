'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Le répertoire des codes promo, à l'écran.
 *
 * Une seule liste, un seul formulaire au-dessus : on ne répète jamais la même
 * information deux fois. Le formulaire sert aussi bien à créer qu'à modifier —
 * cliquer « Modifier » sur une ligne le remplit, il n'y a pas deux endroits où
 * saisir un code.
 */

type Code = {
  code: string;
  libelle: string;
  professeur_id: string | null;
  remise_euros: number;
  categorie: string;
  actif: boolean;
  valide_du: string | null;
  valide_au: string | null;
  usages_par_eleve: number;
  note: string | null;
  utilisations: number;
  remises: number;
  payees: number;
};

const VIDE = {
  code: '',
  libelle: '',
  remise_euros: '10',
  categorie: 'prof',
  usages_par_eleve: '1',
  valide_du: '',
  valide_au: '',
  note: '',
  actif: true,
};

export function TableauCodes() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [form, setForm] = useState({ ...VIDE });
  const [enregistre, setEnregistre] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const res = await fetch('/api/admin/codes');
      const data = await res.json();
      if (!res.ok) {
        setErreur(data.error ?? 'Lecture impossible.');
        setCodes([]);
      } else {
        setErreur(null);
        setCodes(data.codes ?? []);
      }
    } catch {
      setErreur('Erreur de connexion.');
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnregistre(false);
    const res = await fetch('/api/admin/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        remise_euros: Number(form.remise_euros),
        usages_par_eleve: Number(form.usages_par_eleve),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setErreur(data.error ?? 'Enregistrement impossible.');
      return;
    }
    setErreur(null);
    setEnregistre(true);
    setForm({ ...VIDE });
    charger();
  };

  const desactiver = async (code: string) => {
    await fetch(`/api/admin/codes?code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    charger();
  };

  const totalRemises = codes.reduce((s, c) => s + (Number(c.remises) || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Codes promo</h1>
        <p className="text-sm text-slate-600 mt-1">
          Un code absent de cette liste ne marche pas : l’inscription est refusée à l’écran. La
          remise ne s’applique qu’à la <strong>première matinée</strong> d’un élève.
        </p>
      </header>

      {erreur && (
        <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-900">
          {erreur}
        </div>
      )}

      <form onSubmit={soumettre} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <h2 className="font-bold text-slate-900">Créer ou modifier un code</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-600">
            Code
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.replace(/\s+/g, '').toUpperCase() })}
              placeholder="CLAIRE3F7B"
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg font-mono tracking-wide"
              required
            />
          </label>
          <label className="text-sm text-slate-600">
            Libellé (celui du suivi financier)
            <input
              value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })}
              placeholder="Code de Claire M."
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
              required
            />
          </label>
          <label className="text-sm text-slate-600">
            Remise (€)
            <input
              type="number"
              min={0}
              step="0.5"
              value={form.remise_euros}
              onChange={(e) => setForm({ ...form, remise_euros: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </label>
          <label className="text-sm text-slate-600">
            Utilisations par élève
            <input
              type="number"
              min={1}
              value={form.usages_par_eleve}
              onChange={(e) => setForm({ ...form, usages_par_eleve: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </label>
          <label className="text-sm text-slate-600">
            Valable à partir du (facultatif)
            <input
              type="date"
              value={form.valide_du}
              onChange={(e) => setForm({ ...form, valide_du: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </label>
          <label className="text-sm text-slate-600">
            Jusqu’au (facultatif)
            <input
              type="date"
              value={form.valide_au}
              onChange={(e) => setForm({ ...form, valide_au: e.target.value })}
              className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
            />
          </label>
        </div>
        <button
          type="submit"
          className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-purple-700 text-white font-semibold hover:bg-purple-800"
        >
          Enregistrer le code
        </button>
        {enregistre && <p className="text-sm text-green-700 font-semibold">Code enregistré.</p>}
      </form>

      <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-baseline justify-between px-5 py-4">
          <h2 className="font-bold text-slate-900">
            {codes.length} code{codes.length > 1 ? 's' : ''} au répertoire
          </h2>
          <span className="text-sm text-slate-500">
            {totalRemises} € de remises accordées au total
          </span>
        </div>
        {chargement ? (
          <p className="px-5 pb-5 text-sm text-slate-500">Chargement…</p>
        ) : codes.length === 0 ? (
          <p className="px-5 pb-5 text-sm text-slate-500">
            Aucun code. Tant que la liste est vide, aucune remise n’est possible.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-5 py-2.5 font-medium">Code</th>
                <th className="text-left px-5 py-2.5 font-medium">Libellé</th>
                <th className="text-right px-5 py-2.5 font-medium">Remise</th>
                <th className="text-right px-5 py-2.5 font-medium">Utilisé</th>
                <th className="text-right px-5 py-2.5 font-medium">Payé</th>
                <th className="text-right px-5 py-2.5 font-medium">Total remisé</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.code} className="border-t border-slate-100 align-middle">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-900">
                    {c.code}
                    {!c.actif && <span className="ml-2 text-xs font-sans text-slate-400">désactivé</span>}
                  </td>
                  <td className="px-5 py-3 text-slate-700">{c.libelle}</td>
                  <td className="px-5 py-3 text-right">{c.remise_euros} €</td>
                  <td className="px-5 py-3 text-right">{c.utilisations}</td>
                  <td className="px-5 py-3 text-right">{c.payees}</td>
                  <td className="px-5 py-3 text-right font-semibold">{c.remises} €</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() =>
                        setForm({
                          code: c.code,
                          libelle: c.libelle,
                          remise_euros: String(c.remise_euros),
                          categorie: c.categorie,
                          usages_par_eleve: String(c.usages_par_eleve),
                          valide_du: c.valide_du ?? '',
                          valide_au: c.valide_au ?? '',
                          note: c.note ?? '',
                          actif: c.actif,
                        })
                      }
                      className="text-purple-700 hover:underline"
                    >
                      Modifier
                    </button>
                    {c.actif && (
                      <button
                        onClick={() => desactiver(c.code)}
                        className="ml-3 text-slate-400 hover:text-red-700"
                      >
                        Désactiver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
