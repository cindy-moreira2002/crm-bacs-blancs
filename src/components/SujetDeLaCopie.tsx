import type { SujetCopie } from '@/lib/sujet';

/**
 * Le sujet affiché à côté d'une copie corrigée.
 *
 * Deux publics, deux niveaux de détail :
 *  • `avecAttendus={false}` — l'élève. Il voit exactement ce qu'il avait sous
 *    les yeux le jour de l'épreuve : l'énoncé, le texte, les documents. Rien
 *    du corrigé, parce que le même sujet resservira à d'autres.
 *  • `avecAttendus` — le professeur relecteur. Il voit en plus les notions et
 *    les mécanismes attendus, les pièges et les critères particuliers : sans
 *    eux, il ne peut pas juger si la correction est bien faite.
 */
export function SujetDeLaCopie({
  sujet,
  avecAttendus = false,
  titre = 'Le sujet donné à l’élève',
}: {
  sujet: SujetCopie;
  avecAttendus?: boolean;
  titre?: string;
}) {
  const chapeau = [sujet.theme, sujet.domaine].filter(Boolean).join(' · ');
  const attendus = avecAttendus
    ? [
        { titre: 'Notions attendues', items: sujet.notionsAttendues },
        { titre: 'Mécanismes attendus', items: sujet.mecanismesAttendus },
        { titre: 'Étapes attendues', items: sujet.etapesAttendues },
        { titre: 'Critères particuliers', items: sujet.criteresParticuliers },
        { titre: 'Pièges repérés', items: sujet.pieges },
      ].filter((b) => b.items.length)
    : [];

  return (
    <section className="rounded-2xl border border-purple-200 bg-purple-50/60 p-6 space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-purple-700">{titre}</p>
        <h3 className="text-lg font-bold text-gray-900 mt-1">
          {sujet.exercice ?? sujet.travail ?? 'Sujet'}
        </h3>
        {sujet.travail && sujet.exercice && (
          <p className="text-[15px] text-gray-700 mt-0.5">{sujet.travail}</p>
        )}
        {chapeau && <p className="text-sm text-gray-500 mt-0.5">{chapeau}</p>}
        {(sujet.objetEtude || sujet.parcours) && (
          <p className="text-sm text-gray-500 mt-0.5">
            {[sujet.objetEtude, sujet.parcours].filter(Boolean).join(' — ')}
          </p>
        )}
      </div>

      {sujet.presentation && (
        <p className="text-[15px] leading-relaxed text-gray-700 italic">{sujet.presentation}</p>
      )}

      {sujet.enonce && (
        <div className="rounded-xl bg-white border border-purple-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Énoncé</p>
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-900">
            {sujet.enonce}
          </p>
          {sujet.consignes && (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-700 mt-3">
              {sujet.consignes}
            </p>
          )}
        </div>
      )}

      <Reperes sujet={sujet} />

      {sujet.texteSupport && (
        <details className="rounded-xl border border-purple-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 font-semibold text-gray-800 select-none">
            Lire le texte support
            {sujet.auteur ? ` — ${sujet.auteur}` : ''}
            {sujet.annee ? ` (${sujet.annee})` : ''}
          </summary>
          <div className="px-5 pb-5">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
              {sujet.texteSupport}
            </p>
          </div>
        </details>
      )}

      {sujet.documents.map((d, i) => (
        <details key={i} className="rounded-xl border border-purple-200 bg-white">
          <summary className="cursor-pointer px-5 py-3 font-semibold text-gray-800 select-none">
            {d.ref}
          </summary>
          <div className="px-5 pb-5 space-y-2">
            {d.nature && <p className="text-sm text-gray-500 italic">{d.nature}</p>}
            {d.contenu && (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-800">
                {d.contenu}
              </p>
            )}
          </div>
        </details>
      ))}

      {sujet.exigenceDocuments && !sujet.documents.length && (
        <p className="text-sm text-gray-600">
          <span className="font-semibold">Documents : </span>
          {sujet.exigenceDocuments}
        </p>
      )}

      {attendus.length > 0 && (
        <details className="rounded-xl border border-purple-300 bg-white">
          <summary className="cursor-pointer px-5 py-3 font-semibold text-purple-900 select-none">
            Ce que le sujet attend (réservé au relecteur)
          </summary>
          <div className="px-5 pb-5 space-y-4">
            {attendus.map((b) => (
              <div key={b.titre}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                  {b.titre}
                </p>
                <ul className="list-disc pl-5 space-y-1 text-[15px] text-gray-800">
                  {b.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {(sujet.synthetique || sujet.avertissement) && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          {sujet.avertissement ??
            'Gabarit d’entraînement écrit pour nos bacs blancs : ce n’est pas un sujet officiel ni une annale reproduite.'}
        </p>
      )}
    </section>
  );
}

/** Barème, nombre de mots : les contraintes chiffrées de l'épreuve. */
function Reperes({ sujet }: { sujet: SujetCopie }) {
  const reperes: string[] = [];
  if (sujet.bareme) reperes.push(`Noté sur ${sujet.bareme}`);
  if (sujet.motsAttendus) {
    reperes.push(
      sujet.tolerancePourcent
        ? `${sujet.motsAttendus} mots (± ${sujet.tolerancePourcent} %)`
        : `${sujet.motsAttendus} mots`,
    );
  }
  if (sujet.documents.length) {
    reperes.push(`${sujet.documents.length} document${sujet.documents.length > 1 ? 's' : ''}`);
  }
  if (!reperes.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {reperes.map((r) => (
        <span
          key={r}
          className="rounded-full bg-white border border-purple-200 px-3 py-1 text-sm text-gray-700"
        >
          {r}
        </span>
      ))}
    </div>
  );
}

/** Message affiché quand la copie n'a aucune fiche sujet rattachée. */
export function SujetIntrouvable({ raison }: { raison?: string }) {
  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <strong>Sujet non rattaché.</strong>{' '}
      {raison ??
        'Cette copie n’est reliée à aucune fiche sujet en base : impossible d’afficher l’énoncé. À corriger avant d’ouvrir la relecture sur cette matière.'}
    </p>
  );
}
