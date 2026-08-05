import { lireJetonAccesAdmin, secretAccesAdminPresent } from '@/lib/accesAdmin';
import { FormulaireAccesAdmin } from './FormulaireAccesAdmin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Accès administratrice — Les Matinées du Bac',
  robots: { index: false, follow: false },
};

/**
 * /admin/acces?t=… — l'administratrice choisit son propre mot de passe.
 *
 * La page ne fait que vérifier le jeton signé (aucune lecture en base) ;
 * c'est le POST /api/admin/acces qui écrit. Lien généré par
 * `node scripts/lien-acces-admin.mjs <email>`.
 */
export default async function AccesAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  if (!secretAccesAdminPresent()) {
    return (
      <Cadre>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Page non configurée</h1>
        <p className="text-sm text-gray-600">
          La variable <code className="font-mono">PIPELINE_INTERNAL_SECRET</code> manque sur ce
          déploiement.
        </p>
      </Cadre>
    );
  }

  const lu = lireJetonAccesAdmin(t);
  if (!lu) {
    return (
      <Cadre>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide ou expiré</h1>
        <p className="text-sm text-gray-600">
          Ce lien d’accès n’est plus valable (il expire au bout de 72 h). Il suffit d’en
          générer un nouveau :
        </p>
        <p className="text-xs font-mono bg-gray-50 rounded-lg p-3 mt-3">
          node scripts/lien-acces-admin.mjs ton@email.fr
        </p>
      </Cadre>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-gray-100 py-12 px-4">
      <div className="max-w-md mx-auto">
        <p className="text-sm text-purple-700 font-medium text-center">Les Matinées du Bac</p>
        <h1 className="text-2xl font-bold text-gray-900 text-center mt-1 mb-6">
          Ton accès administratrice
        </h1>
        <FormulaireAccesAdmin jeton={t!} email={lu.email} />
        <p className="text-xs text-gray-400 text-center mt-4">
          Le mot de passe est confié directement à l’authentification Supabase — il n’est
          stocké nulle part ailleurs.
        </p>
      </div>
    </div>
  );
}

function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl border border-amber-200 p-6 shadow-sm">
        {children}
      </div>
    </div>
  );
}
