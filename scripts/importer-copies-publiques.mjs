#!/usr/bin/env node
// =====================================================================
//  IMPORTER LES COPIES D'ELEVES REELLES PUBLIEES SUR INTERNET
//
//  Usage :
//    node scripts/importer-copies-publiques.mjs            (verification)
//    node scripts/importer-copies-publiques.mjs --apply     (ecriture)
//    node scripts/importer-copies-publiques.mjs --sql <fichier>
//
//  CE QUE C'EST. Recherche du 6 aout 2026 : ou trouver, en ligne, des
//  copies d'eleves REELLES avec la note mise par un professeur ? Une
//  seule source publie a la fois la copie, la note et le sujet :
//  dropbac.fr (64 copies, deja la source des 21 copies presentes en
//  base). SOS SES en publie 3 (18 a 20/20). Tout le reste du web publie
//  des CORRIGES TYPES rediges par des profs, pas des copies notees.
//
//  CE QUI EST IMPORTE : les 43 copies de dropbac qui n'etaient pas
//  encore en base (22 francais, 11 philosophie, 6 SES, 4 HGGSP).
//
//  CE QUI N'EST PAS IMPORTE, ET POURQUOI :
//    - Le PDF de la copie. On garde le LIEN, jamais le fichier ni son
//      texte : c'est la politique deja retenue pour les 21 premieres
//      (card_json.full_pdf_policy = 'source_link_only').
//    - Les deux sujets ACTIFS du francais (Ensorcelee, Musset "On ne
//      badine") ne recoivent AUCUNE copie nouvelle. Ils ont deja 5 et 4
//      copies reelles decrites (forces, limites, erreurs observees), et
//      le moteur n'en retient que 4 : y ajouter des fiches plus pauvres
//      reviendrait a evincer les bonnes a un mois de la session.
//      Les copies francaises trouvees vont donc sur des fiches support
//      en 'draft', d'ou un professeur pourra les promouvoir apres
//      lecture.
//    - En philosophie, SES et HGGSP au contraire, les sujets actifs
//      n'ont AUCUNE copie reelle : une vraie copie notee, meme sans
//      analyse redigee, y vaut mieux qu'un profil invente. Elles sont
//      donc rattachees aux sujets actifs, avec same_subject = false et
//      le sujet reellement traite dans card_json.support.
//
//  LIMITE MAJEURE, A DIRE CLAIREMENT : les 64 copies publiees vont de
//  14 a 20/20. Internet ne publie que les bonnes copies. Le bas de
//  l'echelle (5 a 13) reste introuvable en ligne : il ne peut venir que
//  des professeurs partenaires. La calibration severe n'est donc PAS
//  corrigee par cet import.
// =====================================================================

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');

function chargerEnv() {
  const env = {};
  for (const fichier of ['.env', '.env.local']) {
    let texte;
    try {
      texte = readFileSync(`${ROOT}/${fichier}`, 'utf8');
    } catch {
      continue;
    }
    for (const ligne of texte.split('\n')) {
      const m = ligne.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

// ---------------------------------------------------------------------
//  1) LES FICHES SUPPORT MANQUANTES (francais, toutes en 'draft')
// ---------------------------------------------------------------------
const AVERTISSEMENT_FICHE =
  "Fiche support creee le 6 aout 2026 pour accueillir des copies reelles notees trouvees en ligne. Elle porte l'oeuvre et l'exercice, PAS la consigne exacte ni le texte du sujet. NE PAS ACTIVER avant de les avoir renseignes ET d'avoir au moins 3 etalons relies.";

const FICHES = [
  { id: 'FR-DISS-MUSSET-AUTRES-QUESTIONS', exercise_type: 'dissertation', work: "Musset, On ne badine pas avec l'amour - autres questions de dissertation (session 2025)", author: 'Alfred de Musset', study_object: 'Le theatre du XVIIe au XXIe siecle' },
  { id: 'FR-DISS-THEATRE', exercise_type: 'dissertation', work: 'Dissertation sur le theatre (sessions 2021 et 2025) - oeuvre non precisee par la source', author: null, study_object: 'Le theatre du XVIIe au XXIe siecle' },
  { id: 'FR-DISS-RABELAIS-GARGANTUA', exercise_type: 'dissertation', work: 'Rabelais, Gargantua', author: 'Francois Rabelais', study_object: "La litterature d'idees du XVIe au XVIIIe siecle" },
  { id: 'FR-DISS-BALZAC', exercise_type: 'dissertation', work: 'Balzac (oeuvre non precisee par la source)', author: 'Honore de Balzac', study_object: 'Le roman et le recit du Moyen Age au XXIe siecle' },
  { id: 'FR-COM-DESNOS-REVE', exercise_type: 'commentaire', work: "Robert Desnos, J'ai tant reve de toi", author: 'Robert Desnos', study_object: 'La poesie du XIXe au XXIe siecle' },
  { id: 'FR-COM-LA-BOETIE-SERVITUDE', exercise_type: 'commentaire', work: 'La Boetie, Discours de la servitude volontaire', author: 'Etienne de La Boetie', study_object: "La litterature d'idees du XVIe au XVIIIe siecle" },
  { id: 'FR-COM-BORIS-VIAN', exercise_type: 'commentaire', work: 'Boris Vian (oeuvre non precisee par la source)', author: 'Boris Vian', study_object: 'Le roman et le recit du Moyen Age au XXIe siecle' },
  { id: 'FR-COM-MOLIERE-BOURGEOIS', exercise_type: 'commentaire', work: 'Moliere, Le Bourgeois gentilhomme', author: 'Moliere', study_object: 'Le theatre du XVIIe au XXIe siecle' },
  { id: 'FR-COM-RABELAIS-QUART-LIVRE', exercise_type: 'commentaire', work: "Rabelais, Quart Livre (l'ile de Ruach)", author: 'Francois Rabelais', study_object: "La litterature d'idees du XVIe au XVIIIe siecle" },
].map((f) => ({
  id: f.id,
  track: 'generale',
  matiere: 'francais',
  exercise_type: f.exercise_type,
  work_id: null,
  status: 'draft',
  card_json: {
    exercise: f.exercise_type === 'commentaire' ? 'Commentaire' : 'Dissertation',
    work: f.work,
    author: f.author,
    study_object: f.study_object,
    role: 'fiche_support_etalonnage',
    source_status: 'fiche_support_a_completer',
    warning: AVERTISSEMENT_FICHE,
  },
}));

// ---------------------------------------------------------------------
//  2) LES 43 COPIES REELLES, ET LE SUJET AUQUEL ON LES RATTACHE
// ---------------------------------------------------------------------
const COPIES = [
  { id: "DB_20_OFFICIELLE_FRANCAIS_DISSERTATION_MUSSET_A", subject_id: "FR-DISS-MUSSET-AUTRES-QUESTIONS", exercise_type: "dissertation", score: 20.0, matiere: "Français", sujet_reel: "Dissertation | Musset — les affrontements", url: "https://www.dropbac.fr/static/img/examples/20_officielle_francais_dissertation_musset_affrontements_2025.pdf" },
  { id: "DB_20_OFFICIELLE_FRANCAIS_DISSERTATION_THEATRE", subject_id: "FR-DISS-THEATRE", exercise_type: "dissertation", score: 20.0, matiere: "Français", sujet_reel: "Dissertation | Théâtre (session 2025)", url: "https://www.dropbac.fr/static/img/examples/20_officielle_francais_dissertation_theatre_2025.pdf" },
  { id: "DB_20_DISSERTATION_RIMBAUD", subject_id: "FR-DISS-RIMBAUD-CAHIER-DOUAI", exercise_type: "dissertation", score: 20.0, matiere: "Français", sujet_reel: "Dissertation | Rimbaud", url: "https://www.dropbac.fr/static/img/examples/20_dissertation_rimbaud.pdf" },
  { id: "DB_20_DISSERTATION_RIMBAUD_N_C2_B02", subject_id: "FR-DISS-RIMBAUD-CAHIER-DOUAI", exercise_type: "dissertation", score: 20.0, matiere: "Français", sujet_reel: "Dissertation | Rimbaud (variante)", url: "https://www.dropbac.fr/static/img/examples/20_dissertation_rimbaud_n%C2%B02.pdf" },
  { id: "DB_19_BAC_BLANC_COMMENTAIRE_DESNOS_REVE_DE_TOI", subject_id: "FR-COM-DESNOS-REVE", exercise_type: "commentaire", score: 19.0, matiere: "Français", sujet_reel: "Commentaire | Robert Desnos, J’ai tant rêvé de toi", url: "https://www.dropbac.fr/static/img/examples/19_bac_blanc_commentaire_desnos_reve_de_toi.pdf" },
  { id: "DB_19_BAC_BLANC_FR_COMMENTAIRE_LA_BOETIE_SERVIT", subject_id: "FR-COM-LA-BOETIE-SERVITUDE", exercise_type: "commentaire", score: 19.0, matiere: "Français", sujet_reel: "Commentaire | La Boétie, Discours de la servitude volontaire", url: "https://www.dropbac.fr/static/img/examples/19_bac_blanc_fr_commentaire_la_boetie_servitude_volontaire.pdf" },
  { id: "DB_19_BLANC_COMMENTAIRE_BORIS_VIAN", subject_id: "FR-COM-BORIS-VIAN", exercise_type: "commentaire", score: 19.0, matiere: "Français", sujet_reel: "Bac blanc | Commentaire : Boris Vian", url: "https://www.dropbac.fr/static/img/examples/19_blanc_commentaire_boris_vian.pdf" },
  { id: "DB_19_BLANC_DISSERTATION_GUARGUANTUA", subject_id: "FR-DISS-RABELAIS-GARGANTUA", exercise_type: "dissertation", score: 19.0, matiere: "Français", sujet_reel: "Bac blanc | Dissertation : Gargantua", url: "https://www.dropbac.fr/static/img/examples/19_blanc_dissertation_guarguantua.pdf" },
  { id: "DB_19_DISSERATION_DE_MUSSET", subject_id: "FR-DISS-MUSSET-AUTRES-QUESTIONS", exercise_type: "dissertation", score: 19.0, matiere: "Français", sujet_reel: "Dissertation | Alfred de Musset", url: "https://www.dropbac.fr/static/img/examples/19_disseration_de_musset.pdf" },
  { id: "DB_19_DISSERTATION_RIMBAUD", subject_id: "FR-DISS-RIMBAUD-CAHIER-DOUAI", exercise_type: "dissertation", score: 19.0, matiere: "Français", sujet_reel: "Dissertation | Rimbaud", url: "https://www.dropbac.fr/static/img/examples/19_dissertation_rimbaud.pdf" },
  { id: "DB_19_DISSERTATION_THEATRE_2021", subject_id: "FR-DISS-THEATRE", exercise_type: "dissertation", score: 19.0, matiere: "Français", sujet_reel: "Dissertation | Théâtre", url: "https://www.dropbac.fr/static/img/examples/19_dissertation_theatre_2021.pdf" },
  { id: "DB_18_DISSERTATION_THEATRE_2025", subject_id: "FR-DISS-THEATRE", exercise_type: "dissertation", score: 18.0, matiere: "Français", sujet_reel: "Dissertation | Théâtre", url: "https://www.dropbac.fr/static/img/examples/18_dissertation_theatre_2025.pdf" },
  { id: "DB_18_DISSERTATION_THEATRE_LE_MENTEUR_2025", subject_id: "FR-DISS-CORNEILLE-LE-MENTEUR", exercise_type: "dissertation", score: 18.0, matiere: "Français", sujet_reel: "Dissertation | Le Menteur (Corneille)", url: "https://www.dropbac.fr/static/img/examples/18_dissertation_theatre_le_menteur_2025.pdf" },
  { id: "DB_18_BAC_BLANC_FRANCAIS_COMMENTAIRE_MOLIERE_BO", subject_id: "FR-COM-MOLIERE-BOURGEOIS", exercise_type: "commentaire", score: 18.0, matiere: "Français", sujet_reel: "Commentaire | Molière, Le Bourgeois gentilhomme", url: "https://www.dropbac.fr/static/img/examples/18_bac_blanc_francais_commentaire_moliere_bourgeois_gentilhomme.pdf" },
  { id: "DB_18_FRANCAIS_EAF_2025_DISSERTATION_ON_NE_BADI", subject_id: "FR-DISS-MUSSET-AUTRES-QUESTIONS", exercise_type: "dissertation", score: 18.0, matiere: "Français", sujet_reel: "Dissertation | Musset, On ne badine pas avec l’amour", url: "https://www.dropbac.fr/static/img/examples/18_francais_eaf_2025_dissertation_on-ne-badine-pas-avec-lamour.pdf" },
  { id: "DB_17_BALZAC_2023", subject_id: "FR-DISS-BALZAC", exercise_type: "dissertation", score: 17.0, matiere: "Français", sujet_reel: "Dissertation | Balzac", url: "https://www.dropbac.fr/static/img/examples/17_balzac_2023.pdf" },
  { id: "DB_17_BAC_BLANC_FRANCAIS_DISSERTATION_GARGANTUA", subject_id: "FR-DISS-RABELAIS-GARGANTUA", exercise_type: "dissertation", score: 17.0, matiere: "Français", sujet_reel: "Dissertation | Rabelais, Gargantua", url: "https://www.dropbac.fr/static/img/examples/17_bac_blanc_francais_dissertation_gargantua_rabelais.pdf" },
  { id: "DB_16_BAC_BLANC_DISSERTATION_MUSSET_AMOUR_ORGUE", subject_id: "FR-DISS-MUSSET-AUTRES-QUESTIONS", exercise_type: "dissertation", score: 16.0, matiere: "Français", sujet_reel: "Dissertation | Musset, On ne badine pas avec l’amour", url: "https://www.dropbac.fr/static/img/examples/16_bac_blanc_dissertation_musset_amour_orgueil.pdf" },
  { id: "DB_16_OFFICIELLE_FRANCAIS_DISSERTATION_MUSSET_2", subject_id: "FR-DISS-MUSSET-AUTRES-QUESTIONS", exercise_type: "dissertation", score: 16.0, matiere: "Français", sujet_reel: "Dissertation | Musset, On ne badine pas avec l’amour", url: "https://www.dropbac.fr/static/img/examples/16_officielle_francais_dissertation_musset_2025.pdf" },
  { id: "DB_15_EXERCICE_COMMENTAIRE_RABELAIS_QUART_LIVRE", subject_id: "FR-COM-RABELAIS-QUART-LIVRE", exercise_type: "commentaire", score: 15.0, matiere: "Français", sujet_reel: "Exercice | Commentaire : Rabelais, Quart Livre (île de Ruach)", url: "https://www.dropbac.fr/static/img/examples/15_exercice_commentaire_rabelais_quart-livre_ile-de-ruach.pdf" },
  { id: "DB_14_BLANC_FR_DISSERT_SARRAUTE_POUR_UN_OUI_OU", subject_id: "FR-DISS-SARRAUTE-POUR-UN-OUI", exercise_type: "dissertation", score: 14.0, matiere: "Français", sujet_reel: "Bac blanc | Dissertation : Sarraute, Pour un oui ou pour un non", url: "https://www.dropbac.fr/static/img/examples/14_blanc_fr_dissert_sarraute_pour-un-oui-ou-pour-un-non_2025.pdf" },
  { id: "DB_14_BLANC_FR_DISSERTATION_THEATRE_BADINE_MUSS", subject_id: "FR-DISS-MUSSET-AUTRES-QUESTIONS", exercise_type: "dissertation", score: 14.0, matiere: "Français", sujet_reel: "Bac blanc | Dissertation : Musset, On ne badine pas avec l’amour", url: "https://www.dropbac.fr/static/img/examples/14_blanc_fr_dissertation_theatre_badine_musset_2025.pdf" },
  { id: "DB_20_HGGSP_CRIME_DE_MASSE_2024", subject_id: "HGGSP2027_DISS_03", exercise_type: "hggsp_dissertation", score: 20.0, matiere: "HGGSP", sujet_reel: "HGGSP | Crimes de masse", url: "https://www.dropbac.fr/static/img/examples/20_hggsp_crime_de_masse_2024.pdf" },
  { id: "DB_18_5_EXERCICE_DISSERTATION_HGGSP_CONQUETE_ES", subject_id: "HGGSP2027_DISS_01", exercise_type: "hggsp_dissertation", score: 18.5, matiere: "HGGSP", sujet_reel: "Exercice | Conquête de l’espace : rivalités et coopérations", url: "https://www.dropbac.fr/static/img/examples/18_5_exercice_dissertation_hggsp_conquete_espace.pdf" },
  { id: "DB_18_EXERCICE_HGGSP_INFORMATION_ENJEU_POLITIQU", subject_id: "HGGSP2027_EC_02", exercise_type: "hggsp_etude_critique", score: 18.0, matiere: "HGGSP", sujet_reel: "Exercice | HGGSP — l’information comme enjeu politique", url: "https://www.dropbac.fr/static/img/examples/18_exercice_hggsp_information_enjeu_politique.pdf" },
  { id: "DB_15_EXERCICE_HGGSP_ETATS_UNIS_ENVIRONNEMENT", subject_id: "HGGSP2027_DISS_02", exercise_type: "hggsp_dissertation", score: 15.0, matiere: "HGGSP", sujet_reel: "Exercice | États-Unis et question environnementale", url: "https://www.dropbac.fr/static/img/examples/15_exercice_hggsp_etats_unis_environnement.pdf" },
  { id: "DB_20_BAC_BLANC_PHILO_SAVOIR_QUI_JE_SUIS", subject_id: "PHI2027_DISS_01", exercise_type: "philo_dissertation", score: 20.0, matiere: "Philosophie", sujet_reel: "Dissertation | Suis-je bien placé pour savoir qui je suis ?", url: "https://www.dropbac.fr/static/img/examples/20_bac_blanc_philo_savoir_qui_je_suis.pdf" },
  { id: "DB_20_OFFICIELLE_PHILO_ETAT_JUSTICE_2022", subject_id: "PHI2027_DISS_01", exercise_type: "philo_dissertation", score: 20.0, matiere: "Philosophie", sujet_reel: "Dissertation | État et justice", url: "https://www.dropbac.fr/static/img/examples/20_officielle_philo_etat_justice_2022.pdf" },
  { id: "DB_19_BAC_BLANC_PHILO_EST_CE_FAIBLESSE_DE_CROIR", subject_id: "PHI2027_DISS_03", exercise_type: "philo_dissertation", score: 19.0, matiere: "Philosophie", sujet_reel: "Bac blanc | Dissertation : Est-ce une faiblesse de croire ?", url: "https://www.dropbac.fr/static/img/examples/19_bac_blanc_philo_est-ce_faiblesse_de_croire.pdf" },
  { id: "DB_19_BAC_BLANC_PHILO_LA_20SCIENCE_EST_ELLE_UNE", subject_id: "PHI2027_DISS_03", exercise_type: "philo_dissertation", score: 19.0, matiere: "Philosophie", sujet_reel: "Bac blanc | Dissertation : La science est-elle une croyance comme les autres ?", url: "https://www.dropbac.fr/static/img/examples/19_bac_blanc_philo_la%20science_est_elle_une%20croyance_comme_les_autres.pdf" },
  { id: "DB_19_DISSERTATION_PHILO_SCIENCE_VERITE_2024", subject_id: "PHI2027_DISS_03", exercise_type: "philo_dissertation", score: 19.0, matiere: "Philosophie", sujet_reel: "Dissertation | La science peut-elle satisfaire notre besoin de vérité ?", url: "https://www.dropbac.fr/static/img/examples/19_dissertation_philo_science_verite_2024.pdf" },
  { id: "DB_19_OFFICIELLE_PHILO_ETAT_JUSTICE_2022", subject_id: "PHI2027_DISS_01", exercise_type: "philo_dissertation", score: 19.0, matiere: "Philosophie", sujet_reel: "Dissertation | État et justice", url: "https://www.dropbac.fr/static/img/examples/19_officielle_philo_etat_justice_2022.pdf" },
  { id: "DB_17_BAC_BLANC_DISSERTATION_PHILO_PEUT_ON_TOUT", subject_id: "PHI2027_DISS_01", exercise_type: "philo_dissertation", score: 17.0, matiere: "Philosophie", sujet_reel: "Bac blanc | Dissertation : Peut-on tout dire ?", url: "https://www.dropbac.fr/static/img/examples/17_bac_blanc_dissertation_philo_peut-on_tout_dire.pdf" },
  { id: "DB_17_DISSERTATION_PHILO_TRAVAIL_ARGENT_2024", subject_id: "PHI2027_DISS_02", exercise_type: "philo_dissertation", score: 17.0, matiere: "Philosophie", sujet_reel: "Dissertation | Travail et argent", url: "https://www.dropbac.fr/static/img/examples/17_dissertation_philo_travail_argent_2024.pdf" },
  { id: "DB_17_BAC_BLANC_PHILO_PASSAGE_TEMPS_MALHEUR", subject_id: "PHI2027_DISS_02", exercise_type: "philo_dissertation", score: 17.0, matiere: "Philosophie", sujet_reel: "Dissertation | Le passage du temps n’est-il que source de malheur ?", url: "https://www.dropbac.fr/static/img/examples/17_bac_blanc_philo_passage_temps_malheur.pdf" },
  { id: "DB_14_DISSERTATION_PHILO_SCIENCES_V_C3_A9RIT_C3", subject_id: "PHI2027_DISS_03", exercise_type: "philo_dissertation", score: 14.0, matiere: "Philosophie", sujet_reel: "Dissertation | La science peut-elle satisfaire notre besoin de vérité ?", url: "https://www.dropbac.fr/static/img/examples/14_dissertation-philo_sciences-v%C3%A9rit%C3%A9_2024.pdf" },
  { id: "DB_14_PHILO_V_C3_A9RIT_C3_A9_ET_SCIENCES", subject_id: "PHI2027_DISS_03", exercise_type: "philo_dissertation", score: 14.0, matiere: "Philosophie", sujet_reel: "Dissertation | Vérité et sciences", url: "https://www.dropbac.fr/static/img/examples/14_philo_v%C3%A9rit%C3%A9_et_sciences.pdf" },
  { id: "DB_20_EPREUVE_COMPOS_C3_A9E_SES_2024", subject_id: "SES2027_TEMPLATE_02", exercise_type: "epreuve_composee_partie_3", score: 20.0, matiere: "SES", sujet_reel: "Épreuve composée | SES", url: "https://www.dropbac.fr/static/img/examples/20_epreuve-compos%C3%A9e-ses_2024.pdf" },
  { id: "DB_20_DISSERTATION_SES_CRISES_FINANCIERES_2024", subject_id: "SES2027_TEMPLATE_07", exercise_type: "dissertation", score: 20.0, matiere: "SES", sujet_reel: "Dissertation | Crises financières et économie réelle", url: "https://www.dropbac.fr/static/img/examples/20_dissertation_ses_crises_financieres_2024.pdf" },
  { id: "DB_20_BAC_SES_EPREUVE_COMPOSEE_COMMERCE_INTERNA", subject_id: "SES2027_TEMPLATE_04", exercise_type: "epreuve_composee_partie_3", score: 20.0, matiere: "SES", sujet_reel: "Épreuve composée | Commerce international", url: "https://www.dropbac.fr/static/img/examples/20_bac_ses_epreuve_composee_commerce_international_2024.pdf" },
  { id: "DB_20_OFFICIELLE_SES_DISSERTATION_CROISSANCE_EC", subject_id: "SES2027_TEMPLATE_01", exercise_type: "dissertation", score: 20.0, matiere: "SES", sujet_reel: "Dissertation | SES — sources de la croissance économique", url: "https://www.dropbac.fr/static/img/examples/20_officielle_ses_dissertation_croissance_economique_2024.pdf" },
  { id: "DB_20_OFFICIELLE_SES_DISSERTATION_ENVIRONNEMENT", subject_id: "SES2027_TEMPLATE_17", exercise_type: "dissertation", score: 20.0, matiere: "SES", sujet_reel: "Dissertation | SES — environnement et externalités", url: "https://www.dropbac.fr/static/img/examples/20_officielle_ses_dissertation_environnement_externalites_2023.pdf" },
  { id: "DB_19_BAC_BLANC_EPREUVE_COMPOSEE_SES", subject_id: "SES2027_TEMPLATE_02", exercise_type: "epreuve_composee_partie_3", score: 19.0, matiere: "SES", sujet_reel: "Bac blanc | Épreuve composée | SES", url: "https://www.dropbac.fr/static/img/examples/19_bac_blanc_epreuve-composee_ses.pdf" },];

/** Sujets actifs qui recoivent des copies d'un AUTRE sujet (repere d'echelle). */
const SUJETS_ACTIFS_RECEVEURS = new Set([
  'PHI2027_DISS_01', 'PHI2027_DISS_02', 'PHI2027_DISS_03',
  'SES2027_TEMPLATE_01', 'SES2027_TEMPLATE_02', 'SES2027_TEMPLATE_04',
  'SES2027_TEMPLATE_07', 'SES2027_TEMPLATE_17',
  'HGGSP2027_DISS_01', 'HGGSP2027_DISS_02', 'HGGSP2027_DISS_03', 'HGGSP2027_EC_02',
]);

/** Le sujet reel de la copie est-il celui de la fiche ? */
const MEME_SUJET = new Set([
  'DB_20_OFFICIELLE_SES_DISSERTATION_CROISSANCE_ECON',
  'DB_20_OFFICIELLE_SES_DISSERTATION_ENVIRONNEMENT_E',
]);

const AVERTISSEMENT_COPIE =
  "Copie d'eleve reelle notee par un professeur, publiee sur dropbac.fr. Le PDF n'est pas stocke : seul le lien source est conserve. Cette fiche ne porte PAS d'analyse redigee (forces, limites, erreurs) : personne ne l'a encore lue chez nous. Elle sert de repere de note, pas de modele a imiter, tant qu'un professeur ne l'a pas relue.";

const NOTE_AUTRE_SUJET =
  "Copie notee sur un AUTRE sujet de la meme epreuve, rattachee ici pour donner un repere d'echelle : le sujet actif n'avait aucune copie reelle. Le champ support dit sur quoi elle a reellement ete ecrite.";

const etalons = COPIES.map((c) => ({
  id: c.id,
  track: c.subject_id.startsWith('FR-TECHNO') ? 'technologique' : 'generale',
  exercise_type: c.exercise_type,
  subject_id: c.subject_id,
  score: c.score,
  error_codes: [],
  validation_status: 'candidate',
  source_url: c.url,
  card_json: {
    support: c.sujet_reel,
    matiere_source: c.matiere,
    origin: 'copie_reelle_publique',
    source_site: 'dropbac.fr',
    full_pdf_policy: 'source_link_only',
    same_subject: MEME_SUJET.has(c.id),
    benchmark_role: `copie_reelle_${String(c.score).replace('.', '_')}_sur_20`,
    normalised_score_on_20: c.score,
    teacher_validation_required: true,
    importe_le: '2026-08-06',
    warning: AVERTISSEMENT_COPIE,
    ...(MEME_SUJET.has(c.id) ? {} : { role: 'repere_d_echelle', note_rattachement: NOTE_AUTRE_SUJET }),
  },
}));

// Correction factuelle reperee pendant la recherche : la source publique
// nomme Richard Rognet, pas Jean-Claude Rognet.
const CORRECTIONS_FICHES = [
  {
    id: 'FR-TECHNO-COM-ROGNET-ELEGIES',
    patch: {
      work: 'Richard Rognet, Elegies pour le temps de vivre',
      author: 'Richard Rognet',
      correction_2026_08_06: "Le nom de l'auteur a ete corrige : la fiche portait 'Jean-Claude Rognet'. La source publique de la copie (dropbac.fr) et le sujet 2025 de la voie technologique donnent Richard Rognet, Elegies pour le temps de vivre.",
    },
  },
];

// ---------------------------------------------------------------------
//  Acces base
// ---------------------------------------------------------------------
const env = chargerEnv();
const URL_BASE = env.PIPELINE_SUPABASE_URL;
const CLE = env.PIPELINE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !CLE) {
  console.error('PIPELINE_SUPABASE_URL / PIPELINE_SUPABASE_SERVICE_ROLE_KEY absents de .env(.local).');
  process.exit(1);
}
const entetes = { apikey: CLE, Authorization: `Bearer ${CLE}` };

async function lire(chemin) {
  const r = await fetch(`${URL_BASE}/rest/v1/${chemin}`, { headers: entetes });
  if (!r.ok) throw new Error(`${chemin} : ${r.status} ${await r.text()}`);
  return r.json();
}
async function poser(table, lignes) {
  if (!lignes.length) return 0;
  const r = await fetch(`${URL_BASE}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: { ...entetes, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(lignes),
  });
  if (!r.ok) throw new Error(`${table} : ${r.status} ${await r.text()}`);
  return lignes.length;
}

// ---------------------------------------------------------------------
//  Verifications avant ecriture
// ---------------------------------------------------------------------
const sujetsExistants = await lire('subject_cards?select=id,track,exercise_type,status,matiere,card_json&limit=2000');
const parId = new Map(sujetsExistants.map((s) => [s.id, s]));
const dejaEnBase = new Set(
  (await lire('benchmark_cards?select=source_url')).map((b) => (b.source_url ?? '').split('?')[0]).filter(Boolean),
);

const erreurs = [];
const doublons = [];
for (const e of etalons) {
  const sujet = parId.get(e.subject_id) ?? FICHES.find((f) => f.id === e.subject_id);
  if (!sujet) {
    erreurs.push(`${e.id} : sujet ${e.subject_id} inconnu.`);
    continue;
  }
  if (sujet.track !== e.track || sujet.exercise_type !== e.exercise_type) {
    erreurs.push(`${e.id} : track/exercise_type (${e.track}/${e.exercise_type}) different du sujet ${e.subject_id} (${sujet.track}/${sujet.exercise_type}) - le moteur ne le trouverait pas.`);
  }
  if (sujet.status === 'active' && !SUJETS_ACTIFS_RECEVEURS.has(e.subject_id)) {
    erreurs.push(`${e.id} : ${e.subject_id} est un sujet ACTIF non declare receveur. Refus : on ne modifie pas en aveugle un sujet en service.`);
  }
  if (dejaEnBase.has(e.source_url.split('?')[0])) doublons.push(e.id);
  if (e.score == null || e.score < 0 || e.score > 20) erreurs.push(`${e.id} : score invalide.`);
}
const aInserer = etalons.filter((e) => !doublons.includes(e.id));

console.log(`${FICHES.length} fiche(s) support a creer, ${aInserer.length} copie(s) a rattacher.`);
if (doublons.length) console.log(`  ${doublons.length} copie(s) deja en base, ignorees : ${doublons.join(', ')}`);
const parSujet = new Map();
for (const e of aInserer) parSujet.set(e.subject_id, [...(parSujet.get(e.subject_id) ?? []), e.score]);
for (const [s, notes] of [...parSujet].sort()) {
  const statut = parId.get(s)?.status ?? 'nouvelle fiche (draft)';
  console.log(`  ${s.padEnd(34)} ${String(statut).padEnd(20)} +${notes.length} copie(s) : ${notes.sort((a, b) => a - b).join(', ')}`);
}
for (const e of erreurs) console.log(`  ✖  ${e}`);
if (erreurs.length) {
  console.error(`\n${erreurs.length} blocage(s) : rien n'est ecrit.`);
  process.exit(1);
}
console.log('  ✔  aucun sujet actif du francais touche, tous les rattachements sont coherents.');

// ---------------------------------------------------------------------
//  Trace SQL, 100% ASCII
// ---------------------------------------------------------------------
const hex = (v) => Buffer.from(v, 'utf8').toString('hex');
function litteral(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return v.length ? `array[${v.map((x) => `'${String(x).replace(/'/g, "''")}'`).join(', ')}]` : "'{}'";
  if (typeof v === 'object') return `convert_from(decode('${hex(JSON.stringify(v))}', 'hex'), 'UTF8')::jsonb`;
  if (/[^\x00-\x7F]/.test(v)) return `convert_from(decode('${hex(v)}', 'hex'), 'UTF8')`;
  return `'${v.replace(/'/g, "''")}'`;
}
function blocInsert(table, colonnes, lignes) {
  const maj = colonnes.filter((c) => c !== 'id').map((c) => `  ${c} = excluded.${c}`).join(',\n');
  return lignes
    .map((l) => `insert into public.${table} (${colonnes.join(', ')})\nvalues (${colonnes.map((c) => litteral(l[c])).join(', ')})\non conflict (id) do update set\n${maj};`)
    .join('\n\n');
}

const iSql = process.argv.indexOf('--sql');
if (iSql !== -1) {
  const chemin = resolve(ROOT, process.argv[iSql + 1]);
  const sql = `-- =====================================================================
--  IMPORTER LES COPIES D'ELEVES REELLES PUBLIEES EN LIGNE
--
--  OU  : Supabase, projet "pipeline de correction" (xgdaibekjmtffvkwvcge)
--  QUOI: SQL Editor > New query > coller UN BLOC > Run
--
--  Genere par scripts/importer-copies-publiques.mjs le ${new Date().toISOString().slice(0, 10)},
--  et deja applique en base par API le meme jour : trace reproductible.
--
--  BLOC A : ${FICHES.length} fiches support francais en 'draft'.
--  BLOC B : ${aInserer.length} copies reelles notees (source dropbac.fr, lien seul).
--  Aucun sujet actif du francais n'est modifie. Notes trouvees : 14 a 20/20
--  uniquement - le bas de l'echelle n'existe pas en ligne.
-- =====================================================================


-- =====================================================================
--  BLOC A - LES ${FICHES.length} FICHES SUPPORT
-- =====================================================================

begin;

${blocInsert('subject_cards', ['id', 'track', 'matiere', 'exercise_type', 'work_id', 'status', 'card_json'], FICHES)}

commit;


-- =====================================================================
--  BLOC B - LES ${aInserer.length} COPIES REELLES
-- =====================================================================

begin;

${blocInsert('benchmark_cards', ['id', 'track', 'exercise_type', 'subject_id', 'score', 'error_codes', 'validation_status', 'source_url', 'card_json'], aInserer)}

commit;


-- =====================================================================
--  BLOC C - VERIFICATION
-- =====================================================================

select s.matiere, s.id, s.status,
       count(b.id) filter (where b.card_json->>'origin' is null or b.card_json->>'origin' not like '%synthetic%') as copies_reelles,
       count(b.id) as etalons
from public.subject_cards s
left join public.benchmark_cards b on b.subject_id = s.id
group by s.matiere, s.id, s.status
order by s.matiere, s.id;
`;
  if (/[^\x00-\x7F]/.test(sql)) throw new Error('Le SQL genere contient des caracteres non-ASCII.');
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, sql);
  console.log(`\nTrace SQL : ${chemin}`);
}

if (process.argv.includes('--apply')) {
  console.log('\nEcriture en base…');
  console.log(`  subject_cards   : ${await poser('subject_cards', FICHES)}`);
  console.log(`  benchmark_cards : ${await poser('benchmark_cards', aInserer)}`);
  for (const c of CORRECTIONS_FICHES) {
    const fiche = parId.get(c.id);
    if (!fiche) continue;
    await poser('subject_cards', [{ ...fiche, card_json: { ...fiche.card_json, ...c.patch } }]);
    console.log(`  correction      : ${c.id}`);
  }
} else {
  console.log('\n(verification seule — relancer avec --apply pour ecrire)');
}
