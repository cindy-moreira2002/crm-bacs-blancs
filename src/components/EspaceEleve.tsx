'use client';

import { useState } from 'react';
import { SESSIONS_PLATEFORME } from '@/lib/sessions';

type Copie = {
  id: string;
  matiere: string;
  eleve_nom: string;
  statut: string;
  created_at: string;
};

type Inscription = {
  id: string;
  nom: string;
  matiere: string;
  date_epreuve: string | null;
  created_at: string;
};

const COULEURS: Record<string, string> = {
  'Français':       '#7C3AED',
  'Philosophie':    '#2563EB',
  'Mathématiques':  '#059669',
  'Histoire-Géo':   '#D97706',
  'SES':            '#DC2626',
  'Spécialité 1':   '#0891B2',
  'Spécialité 2':   '#C026D3',
};
const couleur = (m: string) => COULEURS[m] ?? '#6B7280';

const salonUrl = (id: string) => `https://meet.jit.si/matineesdubac-${id}`;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtMonth(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function joursRestants(iso: string) {
  const t = new Date(); t.setHours(0,0,0,0);
  const d = new Date(iso); d.setHours(0,0,0,0);
  const diff = Math.round((d.getTime()-t.getTime())/86400000);
  if (diff === 0) return "Aujourd'hui !";
  if (diff === 1) return 'Demain';
  if (diff < 0)  return null;
  return `J-${diff}`;
}
function prenom(nom: string) { return nom.split(' ')[0]; }

export function EspaceEleve() {
  const [email, setEmail]               = useState('');
  const [copies, setCopies]             = useState<Copie[] | null>(null);
  const [inscriptions, setInscriptions] = useState<Inscription[] | null>(null);
  const [loading, setLoading]           = useState(false);

  const chercher = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const [rc, ri] = await Promise.all([
        fetch(`/api/copies?eleve_email=${encodeURIComponent(email)}`).then(r => r.json()),
        fetch(`/api/inscriptions?email=${encodeURIComponent(email)}`).then(r => r.json()),
      ]);
      setCopies(rc.copies || []);
      setInscriptions(ri.inscriptions || []);
    } catch { setCopies([]); setInscriptions([]); }
    finally  { setLoading(false); }
  };

  const today = new Date(); today.setHours(0,0,0,0);

  const aVenir = (inscriptions ?? [])
    .filter(i => i.date_epreuve && new Date(i.date_epreuve) >= today)
    .sort((a,b) => new Date(a.date_epreuve!).getTime() - new Date(b.date_epreuve!).getTime());

  const passes = (inscriptions ?? [])
    .filter(i => !i.date_epreuve || new Date(i.date_epreuve) < today)
    .sort((a,b) => new Date(b.date_epreuve ?? b.created_at).getTime() - new Date(a.date_epreuve ?? a.created_at).getTime());

  const prochain = aVenir[0] ?? null;

  // Calendrier à venir : groupé par mois
  const parMois = aVenir.reduce<Record<string, Inscription[]>>((acc, i) => {
    if (!i.date_epreuve) return acc;
    const m = i.date_epreuve.slice(0,7);
    (acc[m] ||= []).push(i);
    return acc;
  }, {});

  // Graphique : tous les BB (passés + à venir) pour la progression
  const allBB = [...passes, ...aVenir];

  // Sessions plateforme pas encore inscrites
  const sessionsDispos = SESSIONS_PLATEFORME.filter(s =>
    new Date(s.date) >= today &&
    !(inscriptions ?? []).some(i => i.matiere === s.matiere && i.date_epreuve === s.date)
  );

  const nomEleve = inscriptions?.[0]?.nom ?? '';
  const aucunResultat = copies !== null && inscriptions !== null && copies.length === 0 && inscriptions.length === 0;

  // ── AVANT CONNEXION ────────────────────────────────────────────────────────
  if (inscriptions === null) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1E1145 0%,#2D1B5E 55%,#1E3A5F 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ background: 'white', borderRadius: 24, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center', boxShadow: '0 24px 80px rgba(0,0,0,.3)' }}>
          <div style={{ fontSize: '2.8rem', marginBottom: 8 }}>🎓</div>
          <h1 style={{ fontFamily: 'inherit', fontWeight: 900, fontSize: '1.8rem', color: '#1E1145', marginBottom: 8 }}>Mon espace élève</h1>
          <p style={{ color: '#6B7280', fontSize: '.95rem', marginBottom: 28, lineHeight: 1.6 }}>
            Accède à tes bacs blancs, ton salon visio et tes dossiers de correction.
          </p>
          <form onSubmit={chercher}>
            <input type="email" required placeholder="Ton adresse email" value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', border: '2px solid #E5E7EB', borderRadius: 12, fontSize: '1rem', marginBottom: 12, outline: 'none', boxSizing: 'border-box' }} />
            <button type="submit" disabled={loading}
              style={{ width: '100%', padding: '13px', background: 'linear-gradient(135deg,#7C3AED,#581C87)', color: '#fff', border: 'none', borderRadius: 12, fontSize: '1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? .7 : 1 }}>
              {loading ? 'Chargement…' : 'Accéder à mon espace →'}
            </button>
          </form>
          <p style={{ marginTop: 20, fontSize: '.8rem', color: '#9CA3AF' }}>
            Pas encore inscrit ? <a href="/inscription" style={{ color: '#7C3AED', fontWeight: 700 }}>S'inscrire →</a>
          </p>
        </div>
      </div>
    );
  }

  // ── AUCUN RÉSULTAT ─────────────────────────────────────────────────────────
  if (aucunResultat) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1E1145,#2D1B5E 55%,#1E3A5F)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: 'white', borderRadius: 24, padding: '48px 40px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div>
          <h2 style={{ fontWeight: 800, color: '#1E1145', marginBottom: 8 }}>Aucune inscription trouvée</h2>
          <p style={{ color: '#6B7280', marginBottom: 24 }}>Vérifie ton adresse email ou inscris-toi à un bac blanc.</p>
          <a href="/inscription" style={{ display: 'inline-block', padding: '12px 24px', background: '#7C3AED', color: '#fff', borderRadius: 12, fontWeight: 700, textDecoration: 'none' }}>
            M'inscrire →
          </a>
          <p style={{ marginTop: 16 }}>
            <button onClick={() => setInscriptions(null)} style={{ background: 'none', border: 'none', color: '#7C3AED', cursor: 'pointer', fontWeight: 600 }}>
              ← Réessayer
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#F8FAFC', minHeight: '100vh', fontFamily: 'inherit' }}>

      {/* ── HERO ── */}
      <div style={{ background: 'linear-gradient(135deg,#1E1145 0%,#2D1B5E 55%,#1E3A5F 100%)', padding: '40px 24px 56px', position: 'relative', overflow: 'hidden' }}>
        {/* glow */}
        <div style={{ position: 'absolute', width: 500, height: 500, right: -150, top: -200, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,.45),transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 2 }}>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: '.8rem', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 6 }}>Espace élève</p>
          <h1 style={{ color: '#fff', fontWeight: 900, fontSize: 'clamp(1.8rem,4vw,2.6rem)', margin: '0 0 6px' }}>
            Salut {prenom(nomEleve)} 👋
          </h1>
          <p style={{ color: 'rgba(255,255,255,.75)', fontSize: '.95rem', marginBottom: 20 }}>
            {passes.length + aVenir.length} bac{passes.length + aVenir.length > 1 ? 's' : ''} blanc{passes.length + aVenir.length > 1 ? 's' : ''} au total
          </p>

          {/* Badges */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {passes.length > 0 && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 100, padding: '7px 14px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
              🔥 {passes.length} BB {passes.length > 1 ? 'passés' : 'passé'}
            </span>}
            {aVenir.length > 0 && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 100, padding: '7px 14px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
              📅 {aVenir.length} à venir
            </span>}
            {(copies ?? []).length > 0 && <span style={{ background: 'rgba(255,255,255,.12)', border: '1px solid rgba(255,255,255,.2)', borderRadius: 100, padding: '7px 14px', fontSize: '.8rem', fontWeight: 700, color: '#fff' }}>
              📄 {(copies ?? []).length} correction{(copies ?? []).length > 1 ? 's' : ''} disponible{(copies ?? []).length > 1 ? 's' : ''}
            </span>}
          </div>
        </div>
      </div>

      {/* ── PROCHAIN BB (si existe) ── */}
      {prochain && (
        <div style={{ maxWidth: 900, margin: '-28px auto 0', padding: '0 24px' }}>
          <div style={{ background: `linear-gradient(135deg,${couleur(prochain.matiere)},${couleur(prochain.matiere)}CC)`, borderRadius: 20, padding: '24px 28px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, boxShadow: `0 12px 40px ${couleur(prochain.matiere)}50`, flexWrap: 'wrap' }}>
            <div>
              <p style={{ opacity: .8, fontSize: '.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 4 }}>Prochain bac blanc</p>
              <h2 style={{ fontWeight: 900, fontSize: '1.6rem', margin: '0 0 4px' }}>{prochain.matiere}</h2>
              {prochain.date_epreuve && <>
                <p style={{ opacity: .9, fontSize: '.9rem' }}>{fmtDate(prochain.date_epreuve)}</p>
                {joursRestants(prochain.date_epreuve) && <p style={{ marginTop: 6, fontWeight: 800, fontSize: '1.1rem' }}>⏳ {joursRestants(prochain.date_epreuve)}</p>}
              </>}
            </div>
            <a href={salonUrl(prochain.id)} target="_blank" rel="noreferrer"
              style={{ background: 'rgba(255,255,255,.95)', color: couleur(prochain.matiere), padding: '13px 22px', borderRadius: 14, fontWeight: 800, fontSize: '.95rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,.15)' }}>
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.069A1 1 0 0121 8.868v6.264a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Rejoindre mon salon
            </a>
          </div>
        </div>
      )}

      {/* ── GRID PRINCIPAL ── */}
      <div style={{ maxWidth: 900, margin: '32px auto 0', padding: '0 24px 48px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 22 }}>

        {/* ── Calendrier mes BB ── */}
        {(aVenir.length > 0 || passes.length > 0) && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '24px 26px', border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              📅 Mes bacs blancs
            </h3>

            {/* À venir groupés par mois */}
            {Object.entries(parMois).sort().map(([mois, list]) => (
              <div key={mois} style={{ marginBottom: 16 }}>
                <p style={{ fontSize: '.75rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #F3F4F6' }}>
                  {fmtMonth(mois+'-01')}
                </p>
                {list.map(i => (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #F9FAFB' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(i.matiere), flexShrink: 0 }} />
                      <div>
                        <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#111827' }}>{i.matiere}</p>
                        {i.date_epreuve && <p style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{fmtDate(i.date_epreuve)} {joursRestants(i.date_epreuve) ? `· ${joursRestants(i.date_epreuve)}` : ''}</p>}
                      </div>
                    </div>
                    <a href={salonUrl(i.id)} target="_blank" rel="noreferrer"
                      style={{ fontSize: '.75rem', fontWeight: 700, color: couleur(i.matiere), background: couleur(i.matiere)+'15', padding: '5px 12px', borderRadius: 100, textDecoration: 'none', flexShrink: 0 }}>
                      Salon →
                    </a>
                  </div>
                ))}
              </div>
            ))}

            {/* Passés */}
            {passes.length > 0 && (
              <div>
                <p style={{ fontSize: '.75rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8, paddingBottom: 4, borderBottom: '1px solid #F3F4F6' }}>
                  Passés
                </p>
                {passes.map(i => {
                  const c = (copies ?? []).find(c => c.matiere.toLowerCase() === i.matiere.toLowerCase());
                  return (
                    <div key={i.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderBottom: '1px solid #F9FAFB', opacity: .75 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(i.matiere), flexShrink: 0 }} />
                        <div>
                          <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#111827' }}>{i.matiere}</p>
                          <p style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{i.date_epreuve ? fmtDate(i.date_epreuve) : 'Date non renseignée'}</p>
                        </div>
                      </div>
                      <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 100, background: c ? '#ECFDF5' : '#FFF7ED', color: c ? '#059669' : '#C2410C' }}>
                        {c ? '✓ Corrigé' : 'En attente'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Graphique d'évolution ── */}
        {allBB.length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '24px 26px', border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              📈 Mon évolution
            </h3>
            {/* Barres par matière */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150, marginBottom: 12, paddingTop: 8 }}>
              {allBB.slice(0, 6).map((i, idx) => {
                const c = (copies ?? []).find(c => c.matiere.toLowerCase() === i.matiere.toLowerCase());
                const isPast = !i.date_epreuve || new Date(i.date_epreuve) < today;
                const pct = c ? 100 : isPast ? 60 : 20;
                const barColor = c ? '#10B981' : isPast ? '#FB923C' : '#C4B5FD';
                return (
                  <div key={i.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <div style={{ width: '100%', maxWidth: 50, borderRadius: '8px 8px 0 0', height: `${pct}%`, background: barColor, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 6, transition: 'height .5s ease' }}>
                      <span style={{ color: '#fff', fontWeight: 800, fontSize: '.78rem' }}>{idx + 1}</span>
                    </div>
                    <p style={{ fontSize: '.65rem', color: '#9CA3AF', fontWeight: 600, textAlign: 'center', lineHeight: 1.3, maxWidth: 56 }}>{i.matiere.replace('Mathématiques','Maths').replace('Histoire-Géo','Hist.')}</p>
                  </div>
                );
              })}
            </div>
            {/* Légende */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px solid #F3F4F6', paddingTop: 14 }}>
              {[['#10B981','Corrigé'],['#FB923C','Passé / en attente'],['#C4B5FD','À venir']].map(([c,l]) => (
                <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.75rem', color: '#6B7280' }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{l}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Mes dossiers de correction ── */}
        {(copies ?? []).length > 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: '24px 26px', border: '1px solid #E5E7EB', boxShadow: '0 2px 12px rgba(0,0,0,.05)' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
              📄 Mes dossiers de correction
            </h3>
            {(copies ?? []).map(c => (
              <a key={c.id} href={`/api/copies/pdf?id=${c.id}`}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, border: '1px solid #E5E7EB', borderRadius: 14, marginBottom: 10, textDecoration: 'none', transition: 'all .2s', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#7C3AED', e.currentTarget.style.boxShadow = '0 8px 20px rgba(124,58,237,.1)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#E5E7EB', e.currentTarget.style.boxShadow = 'none')}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: couleur(c.matiere)+'15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>📝</div>
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '.9rem', color: '#111827' }}>Dossier — {c.matiere}</p>
                    <p style={{ fontSize: '.75rem', color: '#9CA3AF' }}>{new Date(c.created_at).toLocaleDateString('fr-FR')}</p>
                  </div>
                </div>
                <span style={{ color: '#7C3AED', fontWeight: 700, fontSize: '.85rem' }}>Ouvrir →</span>
              </a>
            ))}
          </div>
        )}

        {/* ── Prochains BB plateforme (sessions dispo) ── */}
        {sessionsDispos.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#FFFBEB,#FEF3C7)', borderRadius: 20, padding: '24px 26px', border: '1px solid #FDE68A', boxShadow: '0 2px 12px rgba(0,0,0,.04)' }}>
            <h3 style={{ fontWeight: 800, fontSize: '1rem', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              🆕 Prochains bacs blancs disponibles
            </h3>
            <p style={{ fontSize: '.82rem', color: '#92400E', marginBottom: 18, lineHeight: 1.5 }}>
              Inscris-toi dès maintenant pour réserver ta place.
            </p>
            {sessionsDispos.map(s => (
              <div key={s.matiere+s.date} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '11px 0', borderBottom: '1px solid rgba(251,191,36,.3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: couleur(s.matiere), flexShrink: 0 }} />
                  <div>
                    <p style={{ fontWeight: 700, fontSize: '.88rem', color: '#111827' }}>{s.matiere}</p>
                    <p style={{ fontSize: '.73rem', color: '#92400E' }}>{fmtDate(s.date)} · {s.heure} · {s.places} places</p>
                  </div>
                </div>
                <a href="/inscription" style={{ fontSize: '.75rem', fontWeight: 700, color: '#D97706', background: 'rgba(217,119,6,.12)', padding: '5px 12px', borderRadius: 100, textDecoration: 'none', flexShrink: 0 }}>
                  S'inscrire →
                </a>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
