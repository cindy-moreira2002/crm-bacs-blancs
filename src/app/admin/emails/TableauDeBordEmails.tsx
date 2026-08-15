'use client';

/**
 * Tableau de bord des e-mails (côté client).
 *
 * Une seule source : GET /api/admin/emails/etat, rechargé après chaque
 * action et toutes les 60 secondes. Les boutons passent par
 * POST /api/admin/emails/action.
 */
import { useCallback, useEffect, useState } from 'react';
import type { CaseParcours, LigneParcours, MessageAdmin, SnapshotEmails } from '@/lib/emails/admin';
import { LIBELLE_TYPE, TYPES_EMAIL } from '@/lib/emails/config';
import { LIBELLE_REGLAGE, type Reglages } from '@/lib/emails/reglages-libelles';
import {
  LIBELLE_ETAT,
  LIBELLE_PHASE,
  SYMBOLE_ETAT,
  volumeNominal,
  type EtapeParcours,
  type PhaseParcours,
} from '@/lib/emails/parcours';
import { instantCourt, jourCourt } from '@/lib/emails/temps';

const RAFRAICHISSEMENT_MS = 60_000;

const TONS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-800',
  processing: 'bg-blue-100 text-blue-800',
  sent: 'bg-emerald-100 text-emerald-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
  bloque: 'bg-amber-100 text-amber-800',
};

function Pastille({ statut, libelle }: { statut: string; libelle: string }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
        TONS[statut] ?? 'bg-gray-100 text-gray-600'
      }`}
    >
      {libelle}
    </span>
  );
}

type Apercu = {
  ok: boolean;
  sujet?: string;
  html?: string;
  texte?: string;
  raison?: string;
  destinataire: string;
  type: string;
  categorie: string;
  statut: string;
  variables: Record<string, string>;
};

export function TableauDeBordEmails({ monEmail }: { monEmail: string }) {
  const [etat, setEtat] = useState<SnapshotEmails | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [journal, setJournal] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<'parcours' | 'messages' | 'paiements' | 'reglages'>(
    'parcours',
  );
  const [rechercheEleve, setRechercheEleve] = useState('');
  const [seulementTrous, setSeulementTrous] = useState(false);
  const [masquerTests, setMasquerTests] = useState(false);

  const [filtres, setFiltres] = useState({
    statut: 'tous',
    categorie: 'toutes',
    type: 'tous',
    matiere: 'toutes',
    session: 'toutes',
    role: 'tous',
    depuis: '',
    jusqua: '',
    recherche: '',
  });

  const charger = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(filtres)) if (v) p.set(k, v);
      const res = await fetch(`/api/admin/emails/etat?${p.toString()}`, { cache: 'no-store' });
      const data = (await res.json()) as SnapshotEmails & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Erreur de chargement');
      setEtat(data);
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setChargement(false);
    }
  }, [filtres]);

  useEffect(() => {
    // setTimeout(…, 0) : `charger` pose de l'état, et Next 16 refuse un
    // setState synchrone dans le corps d'un effet.
    const immediat = setTimeout(charger, 0);
    const t = setInterval(charger, RAFRAICHISSEMENT_MS);
    return () => {
      clearTimeout(immediat);
      clearInterval(t);
    };
  }, [charger]);

  async function agir(corps: Record<string, unknown>, cle: string) {
    setOccupe(cle);
    setJournal(null);
    try {
      const res = await fetch('/api/admin/emails/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const data = (await res.json()) as Record<string, unknown> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Erreur');
      return data;
    } catch (err) {
      setJournal(err instanceof Error ? err.message : 'Erreur inconnue');
      return null;
    } finally {
      setOccupe(null);
    }
  }

  async function previsualiser(m: MessageAdmin) {
    return previsualiserId(m.id);
  }

  async function previsualiserId(id: string) {
    const data = await agir({ action: 'previsualiser', id }, `apercu-${id}`);
    if (data) setApercu(data as unknown as Apercu);
  }

  async function envoyerTest(m: MessageAdmin) {
    if (!confirm(`Envoyer une copie de test de « ${m.type_libelle} » à ${monEmail} ?`)) return;
    const data = await agir({ action: 'test', id: m.id }, `test-${m.id}`);
    if (data) setJournal(String(data.message ?? 'Test envoyé.'));
  }

  async function annulerMessage(m: MessageAdmin) {
    if (!confirm(`Annuler « ${m.type_libelle} » pour ${m.destinataire} ?`)) return;
    const data = await agir({ action: 'annuler', id: m.id }, `annuler-${m.id}`);
    if (data) {
      setJournal(String(data.message ?? 'Annulé.'));
      charger();
    }
  }

  async function renvoyer(m: MessageAdmin) {
    const ok = confirm(
      `RENVOI MANUEL\n\n` +
        `Destinataire : ${m.destinataire}\n` +
        `Modèle : ${m.type_libelle}\n` +
        `Élève : ${m.eleve ?? '—'}\n` +
        `Matière : ${m.matiere ?? '—'}\n` +
        `Session : ${m.session_date ?? '—'}\n\n` +
        `Le message part maintenant, à cette adresse. Confirmer ?`,
    );
    if (!ok) return;
    const data = await agir({ action: 'renvoyer', id: m.id, confirme: true }, `renvoyer-${m.id}`);
    if (data) {
      setJournal(String(data.message ?? 'Renvoyé.'));
      charger();
    }
  }

  /** Le feu vert du mode « je relis avant que ça parte » : un message à la fois. */
  async function valider(m: MessageAdmin) {
    const ok = confirm(
      `VALIDER ET ENVOYER\n\n` +
        `Destinataire : ${m.destinataire}\n` +
        `Modèle : ${m.type_libelle}\n` +
        `Élève : ${m.eleve ?? '—'}\n` +
        `Matière : ${m.matiere ?? '—'}\n` +
        `Session : ${m.session_date ?? '—'}\n\n` +
        `Relis-le avec « Voir » si tu as un doute.\n` +
        `Ce message part maintenant, pour de vrai. Confirmer ?`,
    );
    if (!ok) return;
    const data = await agir({ action: 'valider', id: m.id, confirme: true }, `valider-${m.id}`);
    if (data) {
      setJournal(String(data.message ?? 'Message envoyé.'));
      charger();
    }
  }

  async function lancerMoteur(simulation: boolean) {
    if (
      !simulation &&
      !confirm('Lancer le moteur maintenant ? Les messages dus vont réellement partir.')
    ) {
      return;
    }
    const data = await agir({ action: 'executer', simulation }, 'moteur');
    if (data) {
      const e = data.envoi as { envoyes: number; bloques: number; annules: number; echecs: number; reportes: number; dryRun: boolean };
      const p = data.planification as { creees: number; changementsSession: number };
      setJournal(
        `${e.dryRun ? 'Répétition générale' : 'Envoi réel'} — ${p.creees} message(s) mis en file, ` +
          `${e.envoyes} envoyé(s), ${e.bloques} bloqué(s), ${e.annules} annulé(s), ` +
          `${e.echecs} échec(s), ${e.reportes} reporté(s), ` +
          `${p.changementsSession} changement(s) de session détecté(s).`,
      );
      charger();
    }
  }

  async function majReglage(cle: string, valeur: string) {
    const data = await agir({ action: 'reglage', cle, valeur }, `reglage-${cle}`);
    if (data) {
      setJournal('Réglage enregistré.');
      charger();
    }
  }

  async function majPaiement(inscriptionId: string, statut: string, eleve: string) {
    if (!confirm(`Marquer le paiement de ${eleve} comme « ${statut} » ?`)) return;
    const data = await agir(
      { action: 'inscription', inscription_id: inscriptionId, paiement_statut: statut },
      `paiement-${inscriptionId}`,
    );
    if (data) {
      setJournal(`Paiement mis à jour — ${data.misEnFile ?? 0} message(s) mis en file.`);
      charger();
    }
  }

  if (chargement && !etat) {
    return <div className="min-h-screen bg-gray-50 p-8 text-gray-500">Chargement…</div>;
  }

  if (erreur && !etat) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-lg mx-auto bg-white rounded-2xl border border-red-200 p-6">
          <h1 className="font-bold text-gray-900 mb-2">Impossible de charger les e-mails</h1>
          <p className="text-sm text-red-700">{erreur}</p>
          <p className="text-sm text-gray-500 mt-3">
            Si le message parle d’une table absente, il reste à passer le script
            <code className="mx-1 bg-gray-100 px-1 rounded">supabase/sql/28_emails_brevo.sql</code>
            dans Supabase.
          </p>
        </div>
      </div>
    );
  }

  if (!etat) return null;

  const q = etat.quota;
  const pourcentage = Math.min(100, Math.round((q.envoyesAujourdhui / Math.max(1, q.limite)) * 100));

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* En-tête */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">E-mails</h1>
            <p className="text-sm text-gray-600">
              Expéditeur : <strong>{etat.configuration.expediteurNom}</strong> &lt;
              {etat.configuration.expediteur}&gt; · réponses vers {etat.configuration.reponseA}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => lancerMoteur(true)}
              disabled={occupe === 'moteur'}
              className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Répétition générale
            </button>
            <button
              onClick={() => lancerMoteur(false)}
              disabled={occupe === 'moteur'}
              className="rounded-xl bg-purple-700 px-3 py-2 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
            >
              Lancer le moteur
            </button>
          </div>
        </div>

        {/* Alertes */}
        {etat.alertes.length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1">
            {etat.alertes.map((a, i) => (
              <p key={i} className="text-sm text-amber-900">
                ⚠️ {a}
              </p>
            ))}
          </div>
        )}

        {journal && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            {journal}
          </div>
        )}

        {/* Quota + compteurs */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Aujourd’hui</p>
            <p className="text-2xl font-bold text-gray-900">
              {q.envoyesAujourdhui} <span className="text-base font-normal text-gray-500">/ {q.limite}</span>
            </p>
            <div className="mt-2 h-2 rounded-full bg-gray-100">
              <div
                className={`h-2 rounded-full ${pourcentage > 85 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${pourcentage}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              {q.programmesAujourdhui} en attente · marge de sécurité {q.marge}
            </p>
          </div>
          {(['sent', 'scheduled', 'failed'] as const).map((s) => (
            <div key={s} className="rounded-2xl border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {s === 'sent' ? 'Envoyés (total)' : s === 'scheduled' ? 'Programmés' : 'En échec'}
              </p>
              <p className="text-2xl font-bold text-gray-900">{etat.compteurs[s] ?? 0}</p>
              {s === 'failed' && (etat.compteurs.bloque ?? 0) > 0 && (
                <p className="mt-2 text-xs text-amber-700">{etat.compteurs.bloque} bloqué(s)</p>
              )}
            </div>
          ))}
        </div>

        {/* Le parcours prévu — toujours sous la main, quel que soit l'onglet. */}
        <TableauReference etapes={etat.etapes} reglages={etat.reglages} />

        {/* Onglets */}
        <div className="flex gap-2 border-b border-gray-200">
          {(
            [
              ['parcours', `Par élève (${etat.parcours.length})`],
              ['messages', 'Messages'],
              ['paiements', `Paiements à confirmer (${etat.paiementsEnAttente.length})`],
              ['reglages', 'Réglages'],
            ] as const
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              onClick={() => setOnglet(cle)}
              className={`px-3 py-2 text-sm font-medium ${
                onglet === cle
                  ? 'border-b-2 border-purple-700 text-purple-800'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>

        {onglet === 'parcours' && (
          <VueParEleve
            lignes={etat.parcours}
            etapes={etat.etapes}
            recherche={rechercheEleve}
            onRecherche={setRechercheEleve}
            seulementTrous={seulementTrous}
            onSeulementTrous={setSeulementTrous}
            masquerTests={masquerTests}
            onMasquerTests={setMasquerTests}
            onApercu={previsualiserId}
          />
        )}

        {onglet === 'messages' && (
          <>
            {/* Filtres */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <Choix
                libelle="Statut"
                valeur={filtres.statut}
                onChange={(v) => setFiltres({ ...filtres, statut: v })}
                options={[
                  ['tous', 'Tous'],
                  ['scheduled', 'Programmés'],
                  ['pending', 'En attente'],
                  ['sent', 'Envoyés'],
                  ['delivered', 'Délivrés'],
                  ['failed', 'En échec'],
                  ['bloque', 'Bloqués'],
                  ['cancelled', 'Annulés'],
                ]}
              />
              <Choix
                libelle="Catégorie"
                valeur={filtres.categorie}
                onChange={(v) => setFiltres({ ...filtres, categorie: v })}
                options={[
                  ['toutes', 'Toutes'],
                  ['transactional', 'Indispensables'],
                  ['marketing', 'Commerciaux'],
                ]}
              />
              <Choix
                libelle="Type"
                valeur={filtres.type}
                onChange={(v) => setFiltres({ ...filtres, type: v })}
                options={[['tous', 'Tous'], ...TYPES_EMAIL.map((t) => [t, LIBELLE_TYPE[t]] as [string, string])]}
              />
              <Choix
                libelle="Destinataire"
                valeur={filtres.role}
                onChange={(v) => setFiltres({ ...filtres, role: v })}
                options={[
                  ['tous', 'Tous'],
                  ['eleve', 'Élèves'],
                  ['parent', 'Parents'],
                  ['prof', 'Professeurs'],
                  ['prospect', 'Intéressés'],
                ]}
              />
              <Choix
                libelle="Matière"
                valeur={filtres.matiere}
                onChange={(v) => setFiltres({ ...filtres, matiere: v })}
                options={[['toutes', 'Toutes'], ...etat.matieres.map((m) => [m, m] as [string, string])]}
              />
              <Choix
                libelle="Session"
                valeur={filtres.session}
                onChange={(v) => setFiltres({ ...filtres, session: v })}
                options={[['toutes', 'Toutes'], ...etat.sessions.map((s) => [s.id, s.libelle] as [string, string])]}
              />
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-600 mb-1">Depuis</span>
                <input
                  type="date"
                  value={filtres.depuis}
                  onChange={(e) => setFiltres({ ...filtres, depuis: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="block text-xs font-medium text-gray-600 mb-1">Adresse contient</span>
                <input
                  type="search"
                  value={filtres.recherche}
                  onChange={(e) => setFiltres({ ...filtres, recherche: e.target.value })}
                  placeholder="nom@exemple.fr"
                  className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            {/* Tableau */}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Statut</th>
                    <th className="px-3 py-2">Message</th>
                    <th className="px-3 py-2">Destinataire</th>
                    <th className="px-3 py-2">Élève / matière</th>
                    <th className="px-3 py-2">Prévu</th>
                    <th className="px-3 py-2">Envoyé</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {etat.messages.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                        Aucun message pour ces filtres.
                      </td>
                    </tr>
                  )}
                  {etat.messages.map((m) => (
                    <tr key={m.id} className="align-top hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Pastille statut={m.statut} libelle={m.statut_libelle} />
                        {m.blocage && <p className="mt-1 text-xs text-amber-700">{m.blocage}</p>}
                        {m.erreur && <p className="mt-1 text-xs text-red-600">{m.erreur}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-gray-900">{m.type_libelle}</p>
                        <p className="text-xs text-gray-500">
                          {m.categorie === 'marketing' ? 'commercial' : 'indispensable'}
                          {m.tentatives > 0 && ` · ${m.tentatives} tentative(s)`}
                          {m.ouvert && ' · ouvert'}
                          {m.clique && ' · cliqué'}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-gray-900">{m.destinataire}</p>
                        <p className="text-xs text-gray-500">{m.role}</p>
                      </td>
                      <td className="px-3 py-2">
                        <p className="text-gray-900">{m.eleve ?? '—'}</p>
                        <p className="text-xs text-gray-500">
                          {m.matiere ?? '—'}
                          {m.session_date ? ` · ${m.session_date}` : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                        {instantCourt(m.planifie_le)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                        {instantCourt(m.envoye_le)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Bouton onClick={() => previsualiser(m)} occupe={occupe === `apercu-${m.id}`}>
                            Voir
                          </Bouton>
                          <Bouton onClick={() => envoyerTest(m)} occupe={occupe === `test-${m.id}`}>
                            Test
                          </Bouton>
                          {['pending', 'scheduled'].includes(m.statut) && (
                            <Bouton
                              onClick={() => valider(m)}
                              occupe={occupe === `valider-${m.id}`}
                              principal
                            >
                              Valider et envoyer
                            </Bouton>
                          )}
                          {['pending', 'scheduled', 'bloque', 'failed'].includes(m.statut) && (
                            <Bouton onClick={() => annulerMessage(m)} occupe={occupe === `annuler-${m.id}`}>
                              Annuler
                            </Bouton>
                          )}
                          {['failed', 'bloque', 'cancelled'].includes(m.statut) && (
                            <Bouton
                              onClick={() => renvoyer(m)}
                              occupe={occupe === `renvoyer-${m.id}`}
                              principal
                            >
                              Renvoyer
                            </Bouton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {onglet === 'paiements' && (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
            <p className="px-4 pt-4 text-sm text-gray-600">
              Les bacs blancs se règlent par virement : le statut est posé ici, par toi. Marquer
              « payé » envoie la confirmation à l’élève (et au parent) et arrête les relances.
            </p>
            <table className="w-full text-sm mt-3">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Élève</th>
                  <th className="px-3 py-2">Matière</th>
                  <th className="px-3 py-2">Épreuve</th>
                  <th className="px-3 py-2">Inscrit depuis</th>
                  <th className="px-3 py-2">Relances</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {etat.paiementsEnAttente.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-gray-500">
                      Aucun paiement en attente.
                    </td>
                  </tr>
                )}
                {etat.paiementsEnAttente.map((p) => (
                  <tr key={p.inscription_id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-gray-900">{p.eleve}</p>
                      <p className="text-xs text-gray-500">{p.email}</p>
                    </td>
                    <td className="px-3 py-2">{p.matiere ?? '—'}</td>
                    <td className="px-3 py-2">{p.date_epreuve ?? '—'}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{instantCourt(p.depuis)}</td>
                    <td className="px-3 py-2">{p.relances}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <Bouton
                          principal
                          occupe={occupe === `paiement-${p.inscription_id}`}
                          onClick={() => majPaiement(p.inscription_id, 'paye', p.eleve)}
                        >
                          Payé
                        </Bouton>
                        <Bouton
                          occupe={occupe === `paiement-${p.inscription_id}`}
                          onClick={() => majPaiement(p.inscription_id, 'offert', p.eleve)}
                        >
                          Offert
                        </Bouton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {onglet === 'reglages' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600 mb-4">
              Tous les délais du système sont ici. Une modification prend effet au prochain passage
              du moteur (dans les 5 minutes).
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(etat.reglages) as (keyof Reglages)[]).map((cle) => (
                <LigneReglage
                  key={cle}
                  cle={cle}
                  valeur={String(etat.reglages[cle])}
                  occupe={occupe === `reglage-${cle}`}
                  onEnregistrer={(v) => majReglage(cle, v)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Aperçu */}
        {apercu && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
            onClick={() => setApercu(null)}
          >
            <div
              className="mt-8 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {LIBELLE_TYPE[apercu.type as keyof typeof LIBELLE_TYPE] ?? apercu.type}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Vers <strong>{apercu.destinataire}</strong> · {apercu.categorie} · {apercu.statut}
                  </p>
                </div>
                <button onClick={() => setApercu(null)} className="text-gray-400 hover:text-gray-700">
                  ✕
                </button>
              </div>

              {!apercu.ok ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Ce message ne peut pas partir : {apercu.raison}
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-800 mb-2">
                    <span className="text-gray-500">Objet :</span> <strong>{apercu.sujet}</strong>
                  </p>
                  <iframe
                    title="Aperçu de l’e-mail"
                    srcDoc={apercu.html}
                    sandbox=""
                    className="w-full h-[520px] rounded-xl border border-gray-200 bg-gray-50"
                  />
                </>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-gray-600">
                  Variables utilisées ({Object.keys(apercu.variables ?? {}).length})
                </summary>
                <div className="mt-2 max-h-56 overflow-y-auto rounded-lg bg-gray-50 p-3 text-xs font-mono">
                  {Object.entries(apercu.variables ?? {}).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <span className="text-gray-500">{k}</span>
                      <span className="text-gray-900 break-all">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Le parcours prévu, en clair --------------------------------------

const TON_PHASE: Record<PhaseParcours, string> = {
  inscription: 'bg-violet-50 text-violet-900',
  avant: 'bg-blue-50 text-blue-900',
  apres: 'bg-emerald-50 text-emerald-900',
  exception: 'bg-gray-50 text-gray-700',
};

/**
 * Le rappel permanent : tout ce qu'une inscription déclenche, dans l'ordre.
 * Les délais affichés sont ceux des réglages en vigueur, pas des valeurs
 * écrites en dur : ce tableau ne peut donc pas mentir.
 */
function TableauReference({ etapes, reglages }: { etapes: EtapeParcours[]; reglages: Reglages }) {
  const v = volumeNominal(reglages);
  const phases: PhaseParcours[] = ['inscription', 'avant', 'apres', 'exception'];

  return (
    <details className="rounded-2xl border border-gray-200 bg-white" open>
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-gray-900">
        📋 Ce qu’un élève reçoit — le parcours complet
        <span className="ml-2 font-normal text-gray-500">
          {v.eleveMin}–{v.eleveMax} e-mails à l’élève, {v.parentMin}–{v.parentMax} au parent, par
          inscription
        </span>
      </summary>

      <div className="border-t border-gray-100 px-4 pb-4 pt-3">
        <p className="mb-3 text-sm text-gray-600">
          Un parcours = <strong>une inscription</strong>, c’est-à-dire un élève <em>et</em> une
          matière. Un élève inscrit à trois matières parcourt trois fois cette liste. Les délais
          ci-dessous sont ceux de l’onglet <strong>Réglages</strong> : les changer change ce tableau.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 w-10">#</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Quand il part</th>
                <th className="px-3 py-2">Ce qui le déclenche</th>
                <th className="px-3 py-2 text-center">Parent aussi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {phases.map((phase) => {
                const groupe = etapes.filter((e) => e.phase === phase);
                if (!groupe.length) return null;
                return (
                  <ReactFragmentPhase key={phase} phase={phase} groupe={groupe} etapes={etapes} />
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Total dans le cours normal des choses (ni modification ni annulation de session) :{' '}
          <strong>
            {v.totalMin} à {v.totalMax} envois par inscription
          </strong>
          , parent compris quand son adresse est renseignée.
        </p>
      </div>
    </details>
  );
}

/** Un bloc de phase : sa bande de titre, puis ses étapes numérotées. */
function ReactFragmentPhase({
  phase,
  groupe,
  etapes,
}: {
  phase: PhaseParcours;
  groupe: EtapeParcours[];
  etapes: EtapeParcours[];
}) {
  return (
    <>
      <tr className={TON_PHASE[phase]}>
        <td colSpan={5} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide">
          {LIBELLE_PHASE[phase]}
        </td>
      </tr>
      {groupe.map((e) => (
        <tr key={e.type} className="hover:bg-gray-50">
          <td className="px-3 py-2 text-gray-400">{etapes.indexOf(e) + 1}</td>
          <td className="px-3 py-2 font-medium text-gray-900">{e.libelle}</td>
          <td className="px-3 py-2 text-gray-700">{e.quand}</td>
          <td className="px-3 py-2 text-gray-500">{e.declencheur}</td>
          <td className="px-3 py-2 text-center">{e.parent ? '✅' : '—'}</td>
        </tr>
      ))}
    </>
  );
}

// --- Vue « Par élève » ------------------------------------------------

const TON_CASE: Record<string, string> = {
  envoye: 'bg-emerald-50 text-emerald-800',
  programme: 'bg-blue-50 text-blue-800',
  attendu: 'bg-white text-gray-400',
  sans_objet: 'bg-gray-50 text-gray-300',
  annule: 'bg-gray-100 text-gray-400',
  bloque: 'bg-amber-100 text-amber-900',
  echec: 'bg-red-100 text-red-800',
};

/**
 * Une ligne par inscription, une colonne par e-mail du parcours.
 *
 * C'est la réponse à « suis-je sûre que personne n'est passé au travers ». Une
 * case n'est jamais muette : au survol, elle dit son état, sa date, et — si
 * rien ne partira — pourquoi.
 */
function VueParEleve({
  lignes,
  etapes,
  recherche,
  onRecherche,
  seulementTrous,
  onSeulementTrous,
  masquerTests,
  onMasquerTests,
  onApercu,
}: {
  lignes: LigneParcours[];
  etapes: EtapeParcours[];
  recherche: string;
  onRecherche: (v: string) => void;
  seulementTrous: boolean;
  onSeulementTrous: (v: boolean) => void;
  masquerTests: boolean;
  onMasquerTests: (v: boolean) => void;
  onApercu: (id: string) => void;
}) {
  const terme = recherche.trim().toLowerCase();
  const visibles = lignes.filter((l) => {
    if (masquerTests && l.adresseDeTest) return false;
    if (seulementTrous && !l.avertissements.length && !l.problemes) return false;
    if (!terme) return true;
    return [l.eleve, l.email, l.email_parent, l.matiere].some((c) =>
      String(c ?? '').toLowerCase().includes(terme),
    );
  });

  const sansDate = lignes.filter((l) => !l.date_epreuve).length;
  const tests = lignes.filter((l) => l.adresseDeTest).length;
  const enPanne = lignes.filter((l) => l.problemes > 0).length;

  return (
    <div className="space-y-3">
      {/* Ce qui doit sauter aux yeux */}
      {(sansDate > 0 || tests > 0 || enPanne > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1 text-sm text-amber-900">
          {enPanne > 0 && (
            <p>
              ❌ <strong>{enPanne}</strong> inscription(s) ont au moins un message bloqué ou en
              échec.
            </p>
          )}
          {sansDate > 0 && (
            <p>
              📅 <strong>{sansDate}</strong> inscription(s) sans date d’épreuve : les quatre
              messages d’avant-épreuve ne partiront jamais pour elles.
            </p>
          )}
          {tests > 0 && (
            <p>
              🧪 <strong>{tests}</strong> inscription(s) portent une adresse manifestement fictive.
              À annuler avant la vraie mise en service : un envoi vers une adresse inexistante
              rebondit et abîme la réputation de l’expéditeur.
            </p>
          )}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4">
        <label className="text-sm flex-1 min-w-[12rem]">
          <span className="block text-xs font-medium text-gray-600 mb-1">
            Élève, adresse ou matière
          </span>
          <input
            type="search"
            value={recherche}
            onChange={(e) => onRecherche(e.target.value)}
            placeholder="Marie, gmail.com, Philosophie…"
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-1.5">
          <input
            type="checkbox"
            checked={seulementTrous}
            onChange={(e) => onSeulementTrous(e.target.checked)}
            className="rounded border-gray-300"
          />
          Seulement les élèves à problème
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700 pb-1.5">
          <input
            type="checkbox"
            checked={masquerTests}
            onChange={(e) => onMasquerTests(e.target.checked)}
            className="rounded border-gray-300"
          />
          Masquer les adresses de test
        </label>
        <p className="pb-1.5 text-sm text-gray-500">
          {visibles.length} / {lignes.length} inscription(s)
        </p>
      </div>

      {/* Légende */}
      <div className="flex flex-wrap gap-3 px-1 text-xs text-gray-600">
        {(['envoye', 'programme', 'attendu', 'sans_objet', 'bloque', 'echec'] as const).map((e) => (
          <span key={e} className="inline-flex items-center gap-1">
            <span>{SYMBOLE_ETAT[e]}</span>
            {LIBELLE_ETAT[e]}
          </span>
        ))}
      </div>

      {/* Le damier */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 sticky left-0 bg-gray-50 z-10 min-w-[13rem]">
                Élève / matière
              </th>
              {etapes.map((e) => (
                <th key={e.type} className="px-2 py-2 text-center font-medium">
                  <span title={`${e.libelle} — ${e.quand}`}>{e.court}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {visibles.length === 0 && (
              <tr>
                <td colSpan={etapes.length + 1} className="px-3 py-8 text-center text-gray-500">
                  Aucune inscription pour ces filtres.
                </td>
              </tr>
            )}
            {visibles.map((l) => (
              <LigneEleve key={l.inscription_id} ligne={l} etapes={etapes} onApercu={onApercu} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LigneEleve({
  ligne: l,
  etapes,
  onApercu,
}: {
  ligne: LigneParcours;
  etapes: EtapeParcours[];
  onApercu: (id: string) => void;
}) {
  const aUnParent = Boolean(l.email_parent);

  return (
    <>
      <tr className="align-top hover:bg-gray-50">
        <td className="px-3 py-2 sticky left-0 bg-white z-10">
          <p className="font-medium text-gray-900">
            {l.eleve}
            {l.adresseDeTest && (
              <span className="ml-1 rounded bg-gray-200 px-1 text-[10px] uppercase text-gray-600">
                test
              </span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {l.matiere ?? '—'}
            {l.date_epreuve ? ` · ${l.date_epreuve}` : ' · sans date'}
          </p>
          <p className="text-xs text-gray-400 break-all">{l.email ?? 'aucune adresse'}</p>
          {l.avertissements.map((a) => (
            <p key={a} className="mt-1 text-[11px] text-amber-700">
              ⚠️ {a}
            </p>
          ))}
        </td>
        {etapes.map((e) => (
          <Case key={e.type} c={l.cases[e.type]} etape={e} qui="élève" onApercu={onApercu} />
        ))}
      </tr>

      {aUnParent && (
        <tr className="align-top bg-gray-50/60 hover:bg-gray-100/60">
          <td className="px-3 py-1.5 sticky left-0 bg-gray-50 z-10">
            <p className="text-xs text-gray-600">↳ parent</p>
            <p className="text-xs text-gray-400 break-all">{l.email_parent}</p>
          </td>
          {etapes.map((e) => (
            <Case
              key={e.type}
              c={e.parent ? l.casesParent[e.type] : undefined}
              etape={e}
              qui="parent"
              onApercu={onApercu}
            />
          ))}
        </tr>
      )}
    </>
  );
}

function Case({
  c,
  etape,
  qui,
  onApercu,
}: {
  c: CaseParcours | undefined;
  etape: EtapeParcours;
  qui: string;
  onApercu: (id: string) => void;
}) {
  // Pas de case du tout : ce message ne concerne pas ce destinataire.
  if (!c) {
    return (
      <td className="px-2 py-2 text-center text-gray-200" title={`${etape.libelle} — jamais envoyé au parent`}>
        ·
      </td>
    );
  }

  const infobulle = [
    `${etape.libelle} — ${qui}`,
    `état : ${LIBELLE_ETAT[c.etat]}`,
    c.quand ? (c.etat === 'envoye' ? `envoyé le ${instantCourt(c.quand)}` : `prévu le ${instantCourt(c.quand)}`) : null,
    c.nombre > 1 ? `${c.nombre} messages` : null,
    c.detail,
    c.etat === 'attendu' ? `sera créé quand : ${etape.declencheur}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const contenu = (
    <span className="block text-base leading-none">{SYMBOLE_ETAT[c.etat]}</span>
  );

  return (
    <td className={`px-2 py-2 text-center ${TON_CASE[c.etat] ?? ''}`} title={infobulle}>
      {c.emailId ? (
        <button
          onClick={() => onApercu(c.emailId as string)}
          className="w-full rounded hover:ring-2 hover:ring-purple-300"
          aria-label={infobulle}
        >
          {contenu}
        </button>
      ) : (
        contenu
      )}
      {c.quand && (
        <span className="mt-0.5 block text-[10px] leading-tight opacity-70">
          {jourCourt(c.quand)}
        </span>
      )}
      {c.nombre > 1 && <span className="block text-[10px] leading-tight">×{c.nombre}</span>}
    </td>
  );
}

// --- Petites briques --------------------------------------------------

function Bouton({
  children,
  onClick,
  occupe,
  principal,
}: {
  children: React.ReactNode;
  onClick: () => void;
  occupe?: boolean;
  principal?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={occupe}
      className={`rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-50 ${
        principal
          ? 'bg-purple-700 text-white hover:bg-purple-800'
          : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {occupe ? '…' : children}
    </button>
  );
}

function Choix({
  libelle,
  valeur,
  options,
  onChange,
}: {
  libelle: string;
  valeur: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-sm">
      <span className="block text-xs font-medium text-gray-600 mb-1">{libelle}</span>
      <select
        value={valeur}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm bg-white"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function LigneReglage({
  cle,
  valeur,
  occupe,
  onEnregistrer,
}: {
  cle: keyof Reglages;
  valeur: string;
  occupe: boolean;
  onEnregistrer: (v: string) => void;
}) {
  const [v, setV] = useState(valeur);
  // Recalage pendant le rendu (et non dans un effet) quand la valeur en base
  // change : c'est le motif recommandé par React, et le seul que Next 16 accepte.
  const [valeurConnue, setValeurConnue] = useState(valeur);
  if (valeurConnue !== valeur) {
    setValeurConnue(valeur);
    setV(valeur);
  }
  const modifie = v !== valeur;

  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <label className="block text-xs font-medium text-gray-600 mb-1">{LIBELLE_REGLAGE[cle]}</label>
      <div className="flex gap-2">
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={() => onEnregistrer(v)}
          disabled={!modifie || occupe}
          className="rounded-lg bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
        >
          {occupe ? '…' : 'OK'}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400 font-mono">{cle}</p>
    </div>
  );
}
