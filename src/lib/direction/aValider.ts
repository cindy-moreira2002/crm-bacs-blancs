/**
 * Les messages qui attendent un feu vert.
 *
 * ⚠️ SERVEUR UNIQUEMENT.
 *
 * C'est la liste que montre /direction/a-valider, l'écran fait pour le
 * téléphone. La console complète (/direction/emails) continue d'exister et de
 * tout montrer — historique, échecs, réglages, parcours élève par élève. Ici
 * on ne garde qu'une chose : ce qui est prêt à partir et n'attend que toi.
 *
 * On lit peu de colonnes exprès : cet écran s'ouvre depuis une notification,
 * souvent en 4G, parfois dans un couloir.
 */
import { emailsDb } from '@/lib/emails/client';
import { estTypeEmail, LIBELLE_TYPE } from '@/lib/emails/config';
import { chargerReglages, validationManuelle } from '@/lib/emails/reglages';

export type MessageAValider = {
  id: string;
  type: string;
  typeLibelle: string;
  destinataire: string;
  destinataireNom: string | null;
  role: string;
  /** Instant prévu d'envoi (ISO) — presque toujours dans le passé ici. */
  planifieLe: string;
  eleve: string | null;
  matiere: string | null;
};

export type FileAValider = {
  /** Le mode « je relis avant que ça parte » est-il actif ? */
  validationActive: boolean;
  messages: MessageAValider[];
  /** Nombre total, si la liste a été tronquée. */
  total: number;
};

const LIMITE = 60;

export async function chargerFileAValider(): Promise<FileAValider> {
  const reglages = await chargerReglages(true);
  const validationActive = validationManuelle(reglages);

  const { data, count, error } = await emailsDb()
    .from('emails')
    .select(
      'id, type, destinataire_email, destinataire_nom, destinataire_role, planifie_le, variables',
      { count: 'exact' },
    )
    .in('statut', ['pending', 'scheduled'])
    .lte('planifie_le', new Date().toISOString())
    .order('planifie_le', { ascending: true })
    .limit(LIMITE);

  if (error) throw error;

  const lignes = (data ?? []) as {
    id: string;
    type: string;
    destinataire_email: string;
    destinataire_nom: string | null;
    destinataire_role: string;
    planifie_le: string;
    variables: Record<string, string> | null;
  }[];

  return {
    validationActive,
    total: count ?? lignes.length,
    messages: lignes.map((l) => ({
      id: l.id,
      type: l.type,
      typeLibelle: estTypeEmail(l.type) ? LIBELLE_TYPE[l.type] : l.type,
      destinataire: l.destinataire_email,
      destinataireNom: l.destinataire_nom,
      role: l.destinataire_role,
      planifieLe: l.planifie_le,
      // Les variables des modèles portent des noms anglais (`student_name`,
      // `subject_name`) : c'est le vocabulaire de Brevo, on ne le renomme pas.
      eleve: l.variables?.student_name?.trim() || null,
      matiere: l.variables?.subject_name?.trim() || null,
    })),
  };
}
