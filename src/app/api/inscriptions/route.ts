import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normaliserCode, profParCode } from '@/lib/affiliation';
import { beneficiaireAvoir, calculerTarif, consommerAvoirs, crediterParrain } from '@/lib/codesPromo';
import { genererCodeTrio, ouvrirPack } from '@/lib/offres';
import { apresPackAchete, apresTrioCree } from '@/lib/emails/trios';
import { apresAvoirCredite } from '@/lib/emails/promos';
import { codeCopie } from '@/lib/codeCopie';
import { lienSalon } from '@/lib/discord/config';
import { apresInscription } from '@/lib/emails/declencheurs';
import { gardeApiProfDetail } from '@/lib/gardeAcces';
import { eleveConnecte } from '@/lib/authEleve';
import { chargerReglages } from '@/lib/emails/reglages';
import {
  construireCompte,
  referenceVirement,
  type CompteVirement,
} from '@/lib/paiementCompte';

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  // service_role côté serveur : passe outre RLS. Repli sur anon en dev local.
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const GMAIL_WEBAPP = process.env.GMAIL_WEBAPP_URL;

/**
 * La session de `sessions_bacs_blancs` qui correspond à cette matière et cette
 * date, ou `null`. La comparaison des matières est tolérante aux accents et à
 * la casse : « Histoire-Géo » et « histoire-geo » désignent la même épreuve.
 *
 * Une inscription sans date reste sans session : on ne devine pas à quelle
 * épreuve un élève s'inscrit.
 */
async function trouverSession(matiere: string, date: string | null): Promise<string | null> {
  if (!date) return null;
  const { data, error } = await supabase
    .from('sessions_bacs_blancs')
    .select('id, matiere')
    .eq('date_epreuve', date);
  if (error || !data?.length) return null;
  const cible = normMatiere(matiere);
  return data.find((s) => normMatiere(s.matiere) === cible)?.id ?? null;
}

/**
 * Les coordonnées de virement à montrer à la famille, juste après
 * l'inscription. Rien de secret : c'est ce qui figure sur un RIB, et c'est
 * déjà ce que l'e-mail de confirmation contient.
 *
 * En cas de pépin (réglages illisibles), on renvoie `null` : l'écran dira
 * alors que les coordonnées arrivent par e-mail, plutôt que d'afficher un
 * cadre de virement vide.
 */
async function compteVirementPublic(
  inscription: { id?: string } | null,
  nom: string,
  montant: number,
): Promise<CompteVirement | null> {
  try {
    const r = await chargerReglages();
    const compte = construireCompte({
      iban: r.paiement_iban,
      titulaire: r.paiement_titulaire,
      bic: r.paiement_bic,
      // Le prix RÉELLEMENT dû par cette famille, remise déduite — pas le
      // tarif public. Deux écrans qui n'annoncent pas le même montant, c'est
      // un virement du mauvais montant et un rapprochement à la main.
      montant: String(montant),
      reference: referenceVirement(nom, inscription?.id ?? ''),
      delaiMinutes: r.paiement_delai_minutes,
      precisions: r.paiement_instructions,
    });
    return compte.pret ? compte : null;
  } catch (err) {
    console.error('⚠️ Coordonnées de virement indisponibles :', err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      nom,
      email,
      email_parent,
      telephone,
      matiere,
      date_epreuve,
      code_affiliation: codeSaisi,
      engagement,
      // PARRAIN10 est un code partagé : il ne dit pas QUI a parrainé. Sans
      // cette adresse, personne ne peut être crédité des 10 €.
      email_parrain,
    } = await req.json();

    if (!nom || !email || !email_parent || !telephone || !matiere) {
      return NextResponse.json(
        { error: 'Tous les champs sont requis' },
        { status: 400 }
      );
    }

    // L'élève s'inscrit à un ÉVÉNEMENT daté, pas à un service. Sans date, il
    // n'y a pas de place tenue, pas de prof affecté, pas de salle : le
    // navigateur le refuse déjà, le serveur doit le refuser aussi — une
    // inscription sans date se retrouvait rattachée à aucune session et
    // n'apparaissait dans aucun bac blanc.
    if (!date_epreuve) {
      return NextResponse.json(
        { error: 'Choisis la date de la matinée à laquelle tu t’inscris.' },
        { status: 400 },
      );
    }

    // Engagement de présence : c'est la contrepartie du « pas de
    // remboursement en cas d'absence ». Il doit être coché, et on garde la
    // trace de l'acceptation côté serveur — pas seulement une case cochée
    // dans un navigateur.
    if (engagement !== true) {
      return NextResponse.json(
        {
          error:
            'Il faut accepter l’engagement de présence : la place est réservée à ton nom et n’est pas remboursée en cas d’absence.',
        },
        { status: 400 },
      );
    }

    // 1. Insert Supabase — rattaché à SA session quand on peut la retrouver.
    //
    // `session_id` restait vide : le tableau de bord des bacs blancs comptait
    // donc « 0 élève » sur des épreuves pleines, et les e-mails liés à une
    // session ne partaient pas. La matière et la date suffisent à retrouver la
    // ligne de `sessions_bacs_blancs` — c'est exactement ce que l'élève a choisi
    // dans le formulaire, qui lit désormais la même table.
    const sessionId = await trouverSession(matiere, date_epreuve);
    if (!sessionId) {
      // La date envoyée ne correspond à aucune matinée ouverte dans cette
      // matière : formulaire resté ouvert pendant qu'on fermait la session,
      // ou date bricolée. Dans les deux cas, il n'y a pas de place à tenir.
      return NextResponse.json(
        { error: 'Cette matinée n’est plus ouverte à l’inscription. Choisis une autre date.' },
        { status: 409 },
      );
    }

    // Le code du prof qui a recommandé les Matinées. On ne garde QUE le code
    // d'un prof réellement en activité : un code inventé ou recopié de travers
    // laisserait croire, dans la page Paiements, qu'un virement est dû à
    // quelqu'un qui n'existe pas. Une inscription n'échoue jamais pour ça.
    const parrain = await profParCode(codeSaisi);
    const codeAffiliation = parrain ? normaliserCode(parrain.code_affiliation) : null;

    // Le prix de cette inscription : bienvenue à 49 € pour un nouvel élève,
    // code éventuel, puis l'avoir de l'élève s'il en a un. Un code absent du
    // répertoire est REFUSÉ — avant, il était ignoré en silence et la famille
    // croyait avoir une remise qu'elle n'avait pas.
    const tarif = await calculerTarif({
      email,
      nom,
      emailParent: email_parent ?? null,
      code: codeSaisi,
      sessionId,
    });
    if (tarif.etat === 'refus') {
      return NextResponse.json({ error: tarif.message, code_refuse: tarif.code }, { status: 400 });
    }

    const montantPlein = tarif.prix_public;
    const montantDu = tarif.prix_du;

    const row = {
      nom,
      email,
      email_parent,
      telephone,
      matiere,
      date_epreuve,
      paiement_montant: montantDu,
      prix_public: tarif.prix_public,
      ...(sessionId ? { session_id: sessionId } : {}),
      ...(codeAffiliation ? { code_affiliation: codeAffiliation } : {}),
      ...(tarif.code ? { code_promo: tarif.code } : {}),
      ...(tarif.remise > 0 ? { remise_euros: tarif.remise } : {}),
      ...(tarif.avoir_utilise > 0 ? { avoir_utilise: tarif.avoir_utilise } : {}),
      ...(tarif.pack_id ? { pack_id: tarif.pack_id } : {}),
    };
    let { data, error } = await supabase.from('inscriptions').insert([row]).select();

    // Repli si la colonne date_epreuve n'existe pas encore (migration non faite)
    if (error && /date_epreuve/.test(error.message || '')) {
      const { date_epreuve: _omit, ...rowSansDate } = row;
      void _omit;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansDate]).select());
    }

    // Idem pour session_id : mieux vaut une inscription non rattachée qu'une
    // inscription perdue.
    if (error && /session_id/.test(error.message || '')) {
      const { session_id: _sansSession, ...rowSansSession } = row as typeof row & { session_id?: string };
      void _sansSession;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansSession]).select());
    }

    // Repli si les colonnes du script 53 n'existent pas encore : l'inscription
    // passe au prix plein plutôt que d'échouer. La remise sera à reprendre à
    // la main — c'est visible dans /direction/paiements.
    if (error && /(code_promo|remise_euros|prix_public|avoir_utilise)/.test(error.message || '')) {
      const {
        code_promo: _p,
        remise_euros: _r,
        prix_public: _pp,
        avoir_utilise: _av,
        ...rowSansPromo
      } = row as typeof row & {
        code_promo?: string;
        remise_euros?: number;
        prix_public?: number;
        avoir_utilise?: number;
      };
      void _p; void _r; void _pp; void _av;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansPromo]).select());
    }

    // Idem pour code_affiliation (script 09/47 non joué) : on préfère perdre
    // le parrainage plutôt que l'inscription.
    if (error && /code_affiliation/.test(error.message || '')) {
      const { code_affiliation: _sansCode, ...rowSansCode } = row as typeof row & {
        code_affiliation?: string;
      };
      void _sansCode;
      ({ data, error } = await supabase.from('inscriptions').insert([rowSansCode]).select());
    }

    if (error) {
      console.error('Supabase error:', error);
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Vous êtes déjà inscrit à cette matière' },
          { status: 409 }
        );
      }
      throw error;
    }

    console.log('✅ Inscrit Supabase:', { nom, email, matiere });

    // 2. E-mails automatiques.
    //
    // Dès que BREVO_API_KEY est posée, la confirmation (et toute la suite :
    // informations pratiques, lien de visio, rappels) passe par la file
    // d'attente Supabase + Brevo. On MET EN FILE, on n'envoie pas ici : la
    // réponse au navigateur ne dépend jamais de la disponibilité de Brevo, et
    // un double envoi du formulaire ne peut pas produire deux e-mails.
    //
    // Tant que la clé n'est pas posée, l'ancien envoi Gmail (Apps Script)
    // continue de fonctionner exactement comme avant.
    const nouvelleInscription = (data as { id?: string }[] | null)?.[0];

    // L'argent qui change de mains, maintenant que l'inscription existe :
    // l'avoir de l'élève est marqué consommé, et le parrain est crédité.
    // Les deux sont non bloquants — une inscription ne doit jamais échouer
    // pour une écriture comptable, qui se rattrape à la main.
    let codeTrio: { code: string; expire_a: string } | null = null;

    if (nouvelleInscription?.id) {
      if (tarif.avoir_utilise > 0) {
        await consommerAvoirs(email, nouvelleInscription.id, tarif.avoir_utilise);
      }
      if (tarif.avoir_a_crediter > 0 && tarif.code) {
        const credite = await crediterParrain(
          tarif.code,
          nouvelleInscription.id,
          tarif.avoir_a_crediter,
          email_parrain ?? null,
        );
        // Un avoir que personne n'annonce ne sert à rien : le parrain
        // repaierait plein tarif sans savoir qu'il a de l'argent en réserve.
        if (credite) {
          const beneficiaire = await beneficiaireAvoir(tarif.code, email_parrain ?? null);
          if (beneficiaire) {
            await apresAvoirCredite(beneficiaire, tarif.avoir_a_crediter, {
              nom,
              inscription_id: nouvelleInscription.id,
            });
          }
        }
      }
      // La famille achète un pack : les matinées suivantes l'attendent.
      if (tarif.pack_a_creer) {
        const packId = await ouvrirPack({ email, nom }, tarif.pack_a_creer, nouvelleInscription.id);
        if (packId) {
          await apresPackAchete(
            { id: nouvelleInscription.id, email, nom, session_id: sessionId },
            {
              libelle: tarif.motif ?? tarif.pack_a_creer.code,
              total: tarif.pack_a_creer.matinees,
              restantes: tarif.pack_a_creer.matinees - 1,
              // Un an, comme le dit le site : « à utiliser dans l'année ».
              expire_le: new Date(Date.now() + 365 * 86_400_000).toISOString(),
            },
          );
        }
      }
      // Premier du trio : on lui fabrique SON code, bon 48 h pour 2 camarades.
      if (tarif.trio_a_generer && tarif.code) {
        codeTrio = await genererCodeTrio(tarif.code, {
          id: nouvelleInscription.id,
          nom,
          session_id: sessionId,
        });
        if (codeTrio) {
          await apresTrioCree(
            { id: nouvelleInscription.id, email, nom, matiere, session_id: sessionId },
            codeTrio,
          );
        }
      }
    }

    if (process.env.BREVO_API_KEY && nouvelleInscription?.id) {
      try {
        const misEnFile = await apresInscription(nouvelleInscription.id, email, nom);
        console.log(`📬 ${misEnFile} e-mail(s) mis en file pour ${email}`);
      } catch (mailErr) {
        // Non bloquant : le planificateur repassera dans les 5 minutes.
        console.error('⚠️ Mise en file échouée (non bloquant) :', mailErr);
      }
    } else if (GMAIL_WEBAPP) {
      try {
        const mailRes = await fetch(GMAIL_WEBAPP, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (MatineesDuBac)',
          },
          body: JSON.stringify({ nom, email, email_parent, telephone, matiere }),
        });
        console.log('✅ Email Gmail:', mailRes.status);
      } catch (mailErr) {
        console.error('⚠️ Email fail (non-bloquant):', mailErr);
      }
    } else {
      console.warn('⚠️ GMAIL_WEBAPP_URL manquant en .env');
    }

    // L'écran de confirmation a besoin de savoir OÙ virer, tout de suite :
    // l'e-mail peut mettre quelques minutes, et le délai de règlement court
    // dès maintenant. Les mêmes valeurs que celles de l'e-mail, construites
    // par le même code (`construireCompte`) — pas de seconde vérité.
    const paiement = await compteVirementPublic(nouvelleInscription ?? null, nom, montantDu);

    return NextResponse.json(
      {
        success: true,
        data,
        paiement,
        // Ce que la famille doit lire à l'écran : le prix plein, la remise
        // obtenue (ou pourquoi elle ne l'a pas), et ce qu'elle doit virer.
        prix: {
          plein: montantPlein,
          remise: tarif.remise,
          motif: tarif.motif,
          avoir: tarif.avoir_utilise,
          du: montantDu,
          code: tarif.code,
          etat: tarif.etat,
          message: tarif.message,
        },
        // Le premier du trio repart avec son code à partager, et l'heure
        // limite au-delà de laquelle l'offre tombe pour les trois.
        trio: codeTrio,
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('❌ Inscription error:', err);
    return NextResponse.json(
      { error: 'Erreur lors de l\'inscription' },
      { status: 500 }
    );
  }
}

// GET — liste des élèves inscrits aux bacs blancs (filtrable par matière)
/** Comparaison de matières tolérante aux accents et à la casse. */
function normMatiere(v: unknown): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * GET — inscriptions. Chacun ne voit que ce qui le concerne :
 *
 *  - élève connecté  → ses inscriptions à lui, d'après le cookie signé et non
 *    d'après `?email=`, qui laissait consulter l'annuaire de n'importe qui ;
 *  - professeur      → les inscriptions de SES matières (`professeurs.matieres`) ;
 *  - administratrice → tout.
 *
 * L'enjeu n'est pas seulement le nom et l'adresse : chaque ligne porte le
 * `code_copie` signé, qui ouvre l'application d'écriture de l'élève.
 */
export async function GET(req: NextRequest) {
  const eleve = await eleveConnecte();
  let matieresProf: string[] | null = null;

  if (!eleve) {
    const garde = await gardeApiProfDetail();
    if (garde.refus) return garde.refus;
    if (garde.prof.role !== 'admin') {
      matieresProf = (garde.prof.matieres ?? []).map(normMatiere).filter(Boolean);
    }
  }

  try {
    const matiere = req.nextUrl.searchParams.get('matiere');
    const build = (cols: string) => {
      let q = supabase.from('inscriptions').select(cols).order('created_at', { ascending: false });
      if (matiere) q = q.eq('matiere', matiere);
      if (eleve) q = q.eq('email', eleve);
      return q;
    };

    let { data, error } = await build(
      'id, nom, email, matiere, date_epreuve, created_at, discord_salon_id, copie_doc_url',
    );
    // Repli si la colonne copie_doc_url n'existe pas encore (script 51) :
    // l'élève garde son espace, simplement sans le lien de son document.
    if (error && /copie_doc_url/.test(error.message || '')) {
      ({ data, error } = await build(
        'id, nom, email, matiere, date_epreuve, created_at, discord_salon_id',
      ));
    }
    // Repli si la colonne discord_salon_id n'existe pas encore (script 45) :
    // l'élève doit continuer à voir son espace, salon verrouillé.
    if (error && /discord_salon_id/.test(error.message || '')) {
      ({ data, error } = await build('id, nom, email, matiere, date_epreuve, created_at'));
    }
    // Repli si la colonne date_epreuve n'existe pas encore
    if (error && /date_epreuve/.test(error.message || '')) {
      ({ data, error } = await build('id, nom, email, matiere, created_at'));
    }
    if (error) throw error;

    // Le filtrage par matière se fait ici plutôt qu'en SQL : les libellés
    // varient (accents, casse) entre `professeurs.matieres` et `inscriptions`.
    // Les lignes écartées ne quittent jamais le serveur.
    let lignes = (data ?? []) as unknown as {
      nom: string;
      matiere: string;
      discord_salon_id?: string | null;
      copie_doc_url?: string | null;
    }[];
    if (matieresProf) {
      const permises = new Set(matieresProf);
      lignes = lignes.filter((i) => permises.has(normMatiere(i.matiere)));
    }

    // Le code d'accès à la copie est signé ici, côté serveur : le navigateur ne
    // peut pas le recalculer, il ne peut que recevoir celui de ses inscriptions.
    // L'adresse du salon est construite ici, côté serveur : le navigateur ne
    // connaît pas l'identifiant du serveur Discord, et surtout il ne peut pas
    // fabriquer l'adresse d'une salle qui n'est pas la sienne — il reçoit
    // seulement celle inscrite sur SON inscription.
    const inscriptions = lignes.map(({ discord_salon_id, copie_doc_url, ...i }) => ({
      ...i,
      code_copie: codeCopie(i.nom ?? '', i.matiere ?? ''),
      salon_url: lienSalon(discord_salon_id),
      // Le Google Doc de cet élève, tant que l'application d'écriture n'a pas
      // pris toute la place. Les deux cohabitent volontairement.
      copie_doc_url: copie_doc_url ?? null,
    }));

    return NextResponse.json({ inscriptions });
  } catch (err) {
    console.error('❌ Erreur liste inscriptions:', err);
    return NextResponse.json({ error: 'Erreur lecture' }, { status: 500 });
  }
}
