/**
 * « Ce qu'il me reste à faire », matière par matière.
 *
 * ⚠️ SERVEUR UNIQUEMENT — s'appuie sur les deux lecteurs de la base pipeline.
 *
 * Ce module ne découvre rien : il TRADUIT. Les diagnostics techniques
 * (`pipelineVerifs`) et l'état du pipeline (`pipelineEtat`) disent la vérité,
 * mais dans les mots de la base — « gabarit en brouillon », « étalons
 * synthétiques », « grille en calibrating ». Ici, chaque constat devient une
 * phrase qu'on peut lire sans connaître le schéma, avec trois choses :
 *
 *   • ce qu'il faut faire, à l'impératif, en une ligne ;
 *   • QUI le fait — un bouton dans l'application, ou une personne (un prof,
 *     Cindy, la console Anthropic). Confondre les deux est le vrai problème :
 *     une tâche qu'aucun bouton ne peut faire reste ouverte pour toujours si
 *     on l'attend de l'application ;
 *   • OÙ cliquer, quand un écran existe.
 *
 * Rien n'est inventé : si un constat n'a pas de traduction connue, il est
 * repris tel quel plutôt que masqué. Une tâche invisible ne se fait jamais.
 */
import { chargerSante, type AnomalieGlobale } from './pipelineSante';
import type { CibleDiag } from './pipelineVerifs';
import { chargerEtatPipeline, LABELS_MATIERES, type MatiereEtat } from './pipelineEtat';
import { CE_QUI_SE_DEFINIT, LIBELLE_MOTEUR, type MoteurNote } from './moteurs';

/** Qui peut rayer la ligne. */
export type Acteur =
  /** Un bouton de l'application suffit. */
  | 'clic'
  /** Une personne, hors application : un prof, Cindy, une console externe. */
  | 'humain';

export type Tache = {
  id: string;
  /** L'action, à l'impératif, sans jargon. */
  titre: string;
  /** Pourquoi ça compte, en une phrase. Ce qui casse si on ne le fait pas. */
  pourquoi: string;
  /** Ce qu'il faut faire concrètement, quand ce n'est pas évident. */
  comment?: string;
  acteur: Acteur;
  /** true = ça casse aujourd'hui ; false = ça peut attendre, mais pas indéfiniment. */
  bloquant: boolean;
  /** Où aller. Interne à l'app, ou une commande à lancer. */
  ou?: { label: string; href?: string; commande?: string };
};

export type TodoMatiere = {
  matiere: string;
  label: string;
  /** Comment cette matière est notée — « grille commune », « barème du sujet »… */
  moteur: MoteurNote;
  moteur_label: string;
  /** Ce qu'il y a à définir ici, et à quelle fréquence. */
  a_definir: string;
  /** Date de la session vendue, s'il y en a une — ce qui donne l'urgence. */
  date_epreuve: string | null;
  /** La matière accepte-t-elle des copies aujourd'hui ? */
  ouverte: boolean;
  taches: Tache[];
  bloquants: number;
};

export type TodoPipeline = {
  genere_le: string;
  matieres: TodoMatiere[];
  /** Ce qui ne dépend d'aucune matière (plafond de dépense, relecteurs…). */
  general: Tache[];
  totaux: { taches: number; bloquants: number; a_moi: number };
};

/* ------------------------------------------------------------------ */
/*  Traduction des diagnostics                                        */
/* ------------------------------------------------------------------ */

/** « HGGSP2027_DISS_01 », « DISS_01 »… → ce que le diagnostic cite entre « ». */
function citation(texte: string): string | null {
  const m = texte.match(/«\s*([^»]+?)\s*»/);
  return m ? m[1] : null;
}

/**
 * Un diagnostic technique → une tâche lisible.
 *
 * On regarde le texte, parce que c'est lui que produisent les vérificateurs.
 * Chaque règle dit à quoi elle répond, pour qu'on puisse la retrouver quand le
 * texte d'origine change.
 */
/**
 * L'adresse exacte de l'objet concerné, dans le pilotage.
 *
 * Un lien vers `/admin/correction` tout court ramène en haut d'une page de
 * trois écrans : il faut ensuite retrouver soi-même la ligne dont parlait la
 * tâche. Les paramètres disent à la page quoi ouvrir, où défiler et quoi
 * surligner.
 */
function lienPilotage(matiere: string | undefined, cible: CibleDiag | undefined): string {
  const p = new URLSearchParams();
  if (matiere) p.set('matiere', matiere);
  if (cible?.correction_id) p.set('copie', cible.correction_id);
  if (cible?.sujet_id) p.set('sujet', cible.sujet_id);
  const q = p.toString();
  return q ? `/admin/correction?${q}` : '/admin/correction';
}

/** La page d'un bac blanc précis, quand le diagnostic en désigne un. */
function lienBareme(cible: CibleDiag | undefined): string {
  return cible?.exam_id ? `/admin/bareme/${cible.exam_id}` : '/admin/bareme';
}

function traduire(a: AnomalieGlobale, i: number): Tache {
  const quoi = citation(a.texte);
  const bloquant = a.niveau === 'bloquant';
  const base = { id: `${a.matiere ?? 'general'}-${i}`, bloquant };
  // Le libellé du bouton dit ce qu'on va trouver de l'autre côté : « Aller à
  // la copie » sur une page qui ouvre la matière entière serait un mensonge.
  const versPilotage = {
    label: a.cible?.correction_id ? 'Aller à la copie' : a.cible?.sujet_id ? 'Aller au sujet' : 'Ouvrir la matière',
    href: lienPilotage(a.matiere, a.cible),
  };
  const versBareme = {
    label: a.cible?.exam_id ? 'Ouvrir ce bac blanc' : 'Ouvrir les barèmes',
    href: lienBareme(a.cible),
  };

  // « Copie corrigée « xxxxxxxx… » sans dossier élève »
  // À traiter AVANT la règle sur les sujets : les deux parlent de dossier
  // élève, mais ici ce qui est cité est une copie, pas un sujet.
  if (a.texte.startsWith('Copie corrigée')) {
    return {
      ...base,
      titre: 'Refabriquer le dossier d’une copie déjà notée',
      pourquoi: 'La copie est corrigée mais l’élève n’a rien à ouvrir : son dossier n’a jamais été produit.',
      acteur: 'clic',
      comment:
        'Dans « Corrections en direct », retrouve la copie et relance-la : le dossier se refait tout seul.',
      ou: versPilotage,
    };
  }

  // « Sujet X visible au dépôt mais dossier élève en brouillon / absent »
  if (a.texte.includes('dossier élève')) {
    const absent = a.texte.includes('absent');
    return {
      ...base,
      titre: absent
        ? `Créer le dossier élève de l'épreuve du sujet ${quoi ?? ''}`.trim()
        : `Ouvrir le dossier élève du sujet ${quoi ?? ''}`.trim(),
      pourquoi:
        "Le prof peut déposer une copie, mais l'élève ne recevra aucun dossier de correction à la fin.",
      acteur: absent ? 'humain' : 'clic',
      comment: absent
        ? "Cette épreuve n'a pas de modèle de dossier du tout : il faut l'installer (dis-le-moi, c'est du code)."
        : "Dans « Correction », ouvre la matière, puis mets l'épreuve sur « visible » : le sujet, le barème et le dossier s'ouvrent ensemble.",
      ou: versPilotage,
    };
  }

  // « Sujet X visible au dépôt SANS barème actif »
  if (a.texte.includes('SANS barème actif')) {
    return {
      ...base,
      titre: `Fermer le sujet ${quoi ?? ''} ou lui donner son barème`.trim(),
      pourquoi: 'Une copie déposée sur ce sujet plantera : il n’y a rien pour la noter.',
      acteur: 'clic',
      comment:
        'Le plus rapide : remettre ce sujet en « brouillon » tant que son barème n’est pas ouvert.',
      ou: versPilotage,
    };
  }

  // « Épreuve X sans gabarit de dossier élève »
  if (a.texte.includes('sans gabarit de dossier')) {
    return {
      ...base,
      titre: `Installer le dossier élève de l'épreuve ${quoi ?? ''}`.trim(),
      pourquoi: 'Aucun modèle de dossier n’existe pour cette épreuve : rien ne pourra être remis à l’élève.',
      acteur: 'humain',
      comment: 'C’est du code à poser — dis-le-moi.',
    };
  }

  // Étalons : tous synthétiques / aucun validé
  if (a.texte.includes('étalons sont tous synthétiques') || a.texte.includes('synthétiques')) {
    return {
      ...base,
      titre: 'Faire noter 3 vraies copies par un prof de la matière',
      pourquoi:
        'Aujourd’hui, la sévérité de la note est calée sur des copies inventées. Tant que de vraies copies notées par un humain ne sont pas en base, la note peut être trop dure ou trop généreuse.',
      acteur: 'humain',
      comment:
        'Trois copies suffisent : une faible, une moyenne, une bonne. Tu récupères les notes du prof, tu me les donnes, je les pose en base.',
    };
  }

  if (a.texte.includes('sans aucune copie étalon')) {
    return {
      ...base,
      titre: `Ajouter au moins une copie étalon sur le sujet ${quoi ?? ''}`.trim(),
      pourquoi: 'Ce sujet notera sans aucun point de comparaison.',
      acteur: 'humain',
      comment: 'Une copie déjà notée par un prof suffit pour démarrer.',
    };
  }

  // Barème verrouillé / calibration (couche 1)
  if (a.texte.includes("barème n'est pas verrouillé")) {
    return {
      ...base,
      titre: 'Verrouiller le barème avant d’accepter des copies',
      pourquoi:
        'Le barème peut encore changer pendant que des copies sont notées : deux élèves ne seraient pas notés pareil.',
      acteur: 'clic',
      ou: versBareme,
    };
  }
  if (a.texte.includes("jamais été confronté à un correcteur humain") || a.texte.includes('aucune copie étalon n’ait été comparée')) {
    return {
      ...base,
      titre: 'Comparer une copie étalon au barème avant d’ouvrir les corrections',
      pourquoi: 'Personne n’a encore vérifié que la note du barème ressemble à celle d’un prof.',
      acteur: 'humain',
      ou: versBareme,
    };
  }
  // « X » n'a aucune version de barème
  if (a.texte.includes('aucune version de barème')) {
    return {
      ...base,
      titre: `Écrire le barème de « ${quoi ?? 'ce bac blanc'} »`,
      pourquoi: 'Ce bac blanc existe mais rien ne dit combien vaut chaque question : aucune copie ne peut être notée.',
      acteur: 'humain',
      comment: 'Question par question, avec les points. Dis-le-moi si tu veux que je le prépare à partir du sujet.',
      ou: versBareme,
    };
  }

  // « X » n'a aucune copie étalon (couche barème)
  if (a.texte.includes("n'a aucune copie étalon") || a.texte.includes('n’a aucune copie étalon')) {
    return {
      ...base,
      titre: `Faire noter une copie de « ${quoi ?? 'ce bac blanc'} » par un prof`,
      pourquoi:
        'Personne n’a vérifié que ce barème note comme un humain. Une seule copie corrigée des deux côtés suffit à le savoir.',
      acteur: 'humain',
      ou: versBareme,
    };
  }

  // « X » : le barème totalise N points au lieu de M
  if (a.texte.includes('totalise') && a.texte.includes('au lieu de')) {
    const chiffres = a.texte.match(/totalise\s+(\d+)[^0-9]+(\d+)/);
    return {
      ...base,
      titre: `Compléter le barème de « ${quoi ?? 'ce bac blanc'} »`,
      pourquoi: chiffres
        ? `Il ne fait que ${chiffres[1]} points alors que l'épreuve en vaut ${chiffres[2]} : les élèves seraient notés sur une partie du sujet seulement.`
        : a.texte,
      acteur: 'humain',
      comment: 'Il manque des questions, ou des points sur des questions déjà saisies.',
      ou: versBareme,
    };
  }

  // « X » : N blocage(s) dans le barème
  if (a.texte.includes('blocage(s) dans le barème')) {
    const n = a.texte.match(/:\s*(\d+)\s*blocage/);
    return {
      ...base,
      titre: `Réparer ${n ? `${n[1]} question(s)` : 'des questions'} du barème de « ${quoi ?? 'ce bac blanc'} »`,
      pourquoi:
        'Ces questions sont incomplètes (points, réponse attendue ou compétence manquante). Tant qu’elles le sont, le barème ne peut pas être verrouillé.',
      acteur: 'humain',
      comment: 'La page des barèmes montre chaque question fautive, une par une.',
      ou: versBareme,
    };
  }

  if (a.texte.includes('écart systématique')) {
    return {
      ...base,
      titre: 'Reprendre le barème : il note à côté des profs',
      pourquoi: a.texte,
      acteur: 'humain',
      ou: versBareme,
    };
  }

  // Consigne correcteur vide / sans critère
  if (a.texte.includes('sans consigne correcteur') || a.texte.includes('sans aucun critère')) {
    return {
      ...base,
      titre: `Réparer le barème ${quoi ?? ''}`.trim(),
      pourquoi: 'Ce barème est vide : le correcteur n’a aucune instruction, la note sortira au hasard.',
      acteur: 'humain',
      comment: 'C’est du code à reposer — dis-le-moi.',
    };
  }

  // « X n'a pas de profil de transcription dédié »
  if (a.texte.includes('profil de transcription dédié')) {
    return {
      ...base,
      titre: 'Régler la lecture des schémas de SVT',
      pourquoi:
        'Les schémas des copies de SVT sont lus avec le réglage générique : ce qui est dessiné risque d’être mal transcrit.',
      acteur: 'humain',
      comment: 'C’est du code à poser — dis-le-moi.',
    };
  }

  // Aucun retour de prof relecteur, toutes matières confondues
  if (a.texte.includes('retour de prof relecteur')) {
    return {
      ...base,
      titre: 'Faire relire les barèmes par au moins un prof',
      pourquoi:
        'Aucun professeur n’a encore relu une seule grille. Tout ce que le système note aujourd’hui n’a été vérifié par personne.',
      acteur: 'humain',
      comment:
        'Chaque matière a un lien de relecture à envoyer. Dis-moi la matière, je te sors le lien.',
    };
  }

  // Profil de transcription
  if (a.texte.includes('Profil de transcription')) {
    return {
      ...base,
      titre: 'Installer le réglage de lecture des formules',
      pourquoi: 'Sans lui, les formules et les schémas des copies scientifiques seront mal lus.',
      acteur: 'humain',
      comment: 'Une commande à lancer — dis-le-moi, je la lance.',
      ou: { label: 'commande', commande: 'node scripts/profils-transcription.mjs --apply' },
    };
  }

  // Copies bloquées / en échec
  if (a.texte.includes('en échec') || a.texte.includes('bloquée')) {
    return {
      ...base,
      titre: 'Regarder les copies qui ont planté',
      pourquoi:
        'Une copie s’est arrêtée en route : l’élève n’aura rien. Le message d’erreur technique est dans le pilotage.',
      acteur: 'clic',
      comment: 'Dans « Corrections en direct », le bouton « Relancer » reprend la copie là où elle s’est arrêtée.',
      ou: versPilotage,
    };
  }

  // Étalons orphelins
  if (a.texte.includes('orphelin')) {
    return {
      ...base,
      titre: 'Rattacher les copies étalons perdues',
      pourquoi: 'Des copies déjà notées ne servent à rien : elles pointent vers des sujets supprimés.',
      acteur: 'humain',
      comment: 'Une commande à lancer — dis-le-moi.',
      ou: { label: 'commande', commande: 'node scripts/rattacher-etalons-orphelins.mjs' },
    };
  }

  // Faute de traduction connue : on montre le constat brut plutôt que rien.
  return {
    ...base,
    titre: a.texte,
    pourquoi: a.piste ?? 'Constat repris tel quel : je n’ai pas encore de traduction simple pour celui-là.',
    acteur: 'humain',
  };
}

/* ------------------------------------------------------------------ */
/*  Les tâches que les diagnostics ne voient pas                      */
/* ------------------------------------------------------------------ */

/**
 * Ce qui manque à une matière notée par une GRILLE RÉDIGÉE (HGGSP).
 * Les vérificateurs historiques ne connaissent que les deux autres moteurs :
 * sans ça, la matière paraîtrait prête alors que ses notes sont provisoires.
 */
function tachesRedigees(m: MatiereEtat): Tache[] {
  const taches: Tache[] = [];
  const VERROUILLEES = ['locked', 'in_use'];

  for (const g of m.grilles_redigees) {
    if (!VERROUILLEES.includes(g.statut)) {
      taches.push({
        id: `${m.matiere}-grille-${g.id}`,
        titre: `Faire relire « ${g.libelle} » par un prof, puis la verrouiller`,
        pourquoi:
          'Tant que cette grille n’est pas verrouillée, chaque note produite est provisoire : l’élève ne voit qu’une fourchette et un prof doit valider.',
        acteur: 'humain',
        comment:
          'Envoie le lien de relecture à un prof d’HGGSP. Quand il a répondu, dis-le-moi : je valide et je verrouille la grille.',
        bloquant: g.copies > 0,
        ou: { label: 'commande', commande: `node scripts/lien-relecture.mjs ${m.matiere}` },
      });
    }
    if (g.corrections_humaines === 0 && g.etalons > 0) {
      taches.push({
        id: `${m.matiere}-etalons-${g.id}`,
        titre: `Faire noter 3 vraies copies de « ${g.label} » par un prof`,
        pourquoi: `Les ${g.etalons} copies de référence de cette grille sont inventées. Aucun prof n’a jamais vérifié que la note tombe juste.`,
        acteur: 'humain',
        comment:
          'Une copie faible, une moyenne, une bonne. Tu me donnes les notes et les commentaires du prof, je les pose en base.',
        bloquant: false,
      });
    }
    if (g.relectures_ouvertes > 0) {
      taches.push({
        id: `${m.matiere}-relectures-${g.id}`,
        titre: `Traiter ${g.relectures_ouvertes} demande(s) de relecture sur « ${g.label} »`,
        pourquoi:
          'Le correcteur a signalé qu’il n’était pas sûr sur ces copies. Tant que personne ne tranche, la note reste en attente.',
        acteur: 'humain',
        bloquant: true,
      });
    }
  }

  return taches;
}

/* ------------------------------------------------------------------ */

export async function chargerTodo(): Promise<TodoPipeline> {
  const [sante, etat] = await Promise.all([chargerSante(), chargerEtatPipeline()]);

  const parMatiere = new Map<string, Tache[]>();
  const general: Tache[] = [];

  sante.anomalies.forEach((a, i) => {
    // L'inventaire des tables n'est pas une tâche : c'est un garde-fou interne.
    if (a.categorie === 'couverture') return;
    const t = traduire(a, i);
    if (!a.matiere) {
      general.push(t);
      return;
    }
    const liste = parMatiere.get(a.matiere) ?? [];
    liste.push(t);
    parMatiere.set(a.matiere, liste);
  });

  for (const m of etat.matieres) {
    const sup = tachesRedigees(m);
    if (!sup.length) continue;
    parMatiere.set(m.matiere, [...(parMatiere.get(m.matiere) ?? []), ...sup]);
  }

  // Une matière ouverte au dépôt sans aucune session vendue n'est pas une
  // anomalie ; une session vendue sans matière ouverte, si.
  for (const m of etat.matieres) {
    if (m.session && m.visibilite !== 'active') {
      parMatiere.set(m.matiere, [
        ...(parMatiere.get(m.matiere) ?? []),
        {
          id: `${m.matiere}-ouvrir`,
          titre: 'Ouvrir la matière aux profs avant la session',
          pourquoi: `Une session est vendue le ${new Date(m.session.date_epreuve + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, mais les profs ne peuvent pas encore déposer toutes les copies.`,
          acteur: 'clic',
          bloquant: true,
          ou: { label: 'Ouvrir la matière', href: lienPilotage(m.matiere, undefined) },
        },
      ]);
    }
  }

  const matieres: TodoMatiere[] = etat.matieres
    .map((m) => {
      const taches = parMatiere.get(m.matiere) ?? [];
      // Bloquants d'abord, puis ce qui se règle d'un clic : on veut que la
      // première ligne soit toujours celle qui coûte le moins et rapporte le plus.
      taches.sort((a, b) => {
        if (a.bloquant !== b.bloquant) return a.bloquant ? -1 : 1;
        if (a.acteur !== b.acteur) return a.acteur === 'clic' ? -1 : 1;
        return 0;
      });
      return {
        matiere: m.matiere,
        label: LABELS_MATIERES[m.matiere] ?? m.matiere,
        moteur: m.moteur_attendu,
        moteur_label: LIBELLE_MOTEUR[m.moteur_attendu],
        a_definir: CE_QUI_SE_DEFINIT[m.moteur_attendu],
        date_epreuve: m.session?.date_epreuve ?? null,
        ouverte: m.visibilite === 'active',
        taches,
        bloquants: taches.filter((t) => t.bloquant).length,
      };
    })
    // Les matières qui ont une session passent devant, par date ; puis celles
    // qui ont le plus de bloquants ; les matières finies tombent en bas.
    .sort((a, b) => {
      if (a.date_epreuve && b.date_epreuve) return a.date_epreuve.localeCompare(b.date_epreuve);
      if (a.date_epreuve) return -1;
      if (b.date_epreuve) return 1;
      if (a.bloquants !== b.bloquants) return b.bloquants - a.bloquants;
      return b.taches.length - a.taches.length;
    });

  const toutes = [...matieres.flatMap((m) => m.taches), ...general];
  return {
    genere_le: new Date().toISOString(),
    matieres,
    general,
    totaux: {
      taches: toutes.length,
      bloquants: toutes.filter((t) => t.bloquant).length,
      a_moi: toutes.filter((t) => t.acteur === 'humain').length,
    },
  };
}
