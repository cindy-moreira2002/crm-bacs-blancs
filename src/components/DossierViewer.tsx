'use client';

import { useRef } from 'react';

/**
 * Affiche un dossier de correction et permet de l'enregistrer en PDF
 * (impression du navigateur -> « Enregistrer au format PDF »).
 */
export function DossierViewer({ correctionId }: { correctionId: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const imprimer = () => {
    const w = iframeRef.current?.contentWindow;
    if (w) { w.focus(); w.print(); }
  };

  return (
    <>
      <div className="max-w-4xl mx-auto mb-4 flex flex-wrap gap-3">
        <button onClick={imprimer}
          className="px-5 py-2.5 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700">
          Télécharger le PDF
        </button>
        <a href={`/api/pipeline/dossier/${correctionId}`} target="_blank" rel="noopener noreferrer"
          className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-gray-50">
          Ouvrir la version imprimable
        </a>
      </div>

      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <iframe
          ref={iframeRef}
          src={`/api/pipeline/dossier/${correctionId}`}
          title="Dossier de correction"
          className="w-full"
          style={{ height: '85vh', border: 0 }}
        />
      </div>
    </>
  );
}
