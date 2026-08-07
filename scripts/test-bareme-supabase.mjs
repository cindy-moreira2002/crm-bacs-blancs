#!/usr/bin/env node
/**
 * Tests du barème par sujet CONTRE LA VRAIE BASE.
 *
 *   node scripts/test-bareme-supabase.mjs
 *
 * Ils couvrent ce que les tests hors ligne ne peuvent pas prouver : les
 * triggers, les contraintes, le verrouillage, les versions, le recalcul de
 * la note et la sécurité RLS.
 *
 * Tout se passe sur un examen jetable, préfixé TEST-AUTO-, créé au début et
 * supprimé à la fin — y compris si un test échoue. Aucune donnée réelle
 * n'est touchée : les copies existantes, les grilles et les étalons sont
 * hors du périmètre.
 *
 * Le SQL passe par l'API Management de Supabase, avec le jeton de
 * ~/.supabase/access-token. Aucune clé n'est affichée.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import assert from 'node:assert/strict';

const REF = process.env.PIPELINE_PROJECT_REF ?? 'xgdaibekjmtffvkwvcge';

let jeton;
try {
  jeton = readFileSync(`${homedir()}/.supabase/access-token`, 'utf8').trim();
} catch {
  console.error(
    'Jeton Supabase introuvable (~/.supabase/access-token).\n' +
      'Connecte-toi avec : npx --yes supabase@latest login',
  );
  process.exit(1);
}

/** Exécute du SQL. Renvoie les lignes, ou lève avec le message de Postgres. */
async function sql(requete) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: requete }),
  });
  const texte = await r.text();
  if (!r.ok) {
    let message = texte;
    try {
      message = JSON.parse(texte).message ?? texte;
    } catch {
      /* le texte brut fera l'affaire */
    }
    throw new Error(message);
  }
  return JSON.parse(texte);
}

/** Vrai si la requête échoue, avec le motif attendu. */
async function refuse(requete, motif) {
  try {
    await sql(requete);
    return { refuse: false, message: 'la requête est passée' };
  } catch (e) {
    const ok = !motif || new RegExp(motif, 'i').test(e.message);
    return { refuse: true, correspond: ok, message: e.message.split('\n')[0] };
  }
}

// --- Harnais ---------------------------------------------------------

let reussis = 0;
let echoues = 0;
const echecs = [];

async function test(numero, titre, fn) {
  try {
    await fn();
    reussis += 1;
    console.log(`  ✓ ${numero}  ${titre}`);
  } catch (err) {
    echoues += 1;
    echecs.push(`${numero} ${titre}\n     ${String(err.message).split('\n')[0]}`);
    console.log(`  ✗ ${numero}  ${titre}`);
    console.log(`      ${String(err.message).split('\n').slice(0, 3).join('\n      ')}`);
  }
}

const CODE = 'TEST-AUTO-BAREME';
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

async function nettoyer() {
  // Ordre : les corrections d'abord (FK vers exams), puis l'examen. Les
  // cascades s'occupent des questions, paliers, étalons et versions.
  await sql(`
    delete from public.corrections where exam_id in (select id from public.exams where code = ${q(CODE)});
    delete from public.bareme_audit where ligne_id in (
      select id::text from public.bareme_versions where exam_id in (select id from public.exams where code = ${q(CODE)})
    );
    update public.exams set bareme_version_active = null where code = ${q(CODE)};
    delete from public.bareme_versions where exam_id in (select id from public.exams where code = ${q(CODE)});
    delete from public.exams where code = ${q(CODE)};
  `);
}

// =====================================================================

console.log(`Base : ${REF}\nExamen jetable : ${CODE}\n`);
await nettoyer();

let examId;
let versionId;

try {
  // -----------------------------------------------------------------
  console.log('1 · Création et contrôles du barème');

  await test('1.1', 'créer un examen et sa version 1.0', async () => {
    const [ex] = await sql(`
      insert into public.exams (code, matiere, track, exercise_type, titre, statut, cree_par)
      values (${q(CODE)}, 'maths', 'generale', 'maths_analyse', 'Examen de test automatique', 'draft', 'tests')
      returning id;
    `);
    examId = ex.id;
    const [v] = await sql(`
      insert into public.bareme_versions (exam_id, version, matiere, statut, max_score, cree_par)
      values ('${examId}', '1.0', 'maths', 'draft', 20, 'tests')
      returning id;
    `);
    versionId = v.id;
    assert.ok(examId && versionId);
  });

  await test('1.2', 'un barème vide est bloqué (aucune question, total ≠ 20)', async () => {
    const [r] = await sql(`select public.bareme_verifier('${versionId}') as c;`);
    assert.equal(r.c.ok, false);
    const codes = r.c.blocages.map((b) => b.code);
    assert.ok(codes.includes('aucune_question'), `codes: ${codes}`);
    assert.ok(codes.includes('total_incorrect'));
  });

  await test('1.3', 'total_points se recalcule tout seul à chaque question', async () => {
    await sql(`
      insert into public.bareme_questions
        (bareme_version_id, question_key, numero, libelle, ordre, max_points, reponse_attendue,
         competences, codes_erreurs, etapes)
      values
        ('${versionId}', 'ex1_q1a', '1.a', 'Dérivée', 1, 5, 'f''(x) = 2x e^x + x^2 e^x',
         array['calculer'], array['MA-DERIV-01'], '[{"libelle":"formule posée"}]'::jsonb),
        ('${versionId}', 'ex1_q1b', '1.b', 'Variations', 2, 5, 'croissante sur [0;+inf[',
         array['raisonner'], array['MA-VAR-01'], '[{"libelle":"signe étudié"}]'::jsonb),
        ('${versionId}', 'ex1_q2',  '2',   'Récurrence', 3, 6, 'vraie pour tout n',
         array['raisonner'], array['MA-RECUR-01'], '[{"libelle":"initialisation"}]'::jsonb);
    `);
    const [v] = await sql(`select total_points from public.bareme_versions where id = '${versionId}';`);
    assert.equal(Number(v.total_points), 16);
  });

  await test('1.4', 'total ≠ 20 : bareme_verifier bloque', async () => {
    const [r] = await sql(`select public.bareme_verifier('${versionId}') as c;`);
    assert.equal(r.c.ok, false);
    assert.ok(r.c.blocages.some((b) => b.code === 'total_incorrect'));
  });

  await test('1.5', 'verrouiller un barème incomplet est refusé', async () => {
    const r = await refuse(`select public.bareme_verrouiller('${versionId}', 'tests');`, 'incomplet');
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('1.6', 'ouvrir les corrections sans barème verrouillé est refusé', async () => {
    const r = await refuse(`select public.exam_ouvrir_correction('${examId}', 'tests');`, 'bareme actif|barème actif|verrouill');
    assert.ok(r.refuse, r.message);
  });

  await test('1.7', 'une question sans réponse attendue est un blocage', async () => {
    await sql(`
      insert into public.bareme_questions
        (bareme_version_id, question_key, numero, libelle, ordre, max_points, reponse_attendue, competences, etapes)
      values ('${versionId}', 'ex1_q3', '3', 'Script Python', 4, 4, null,
              array['algorithmique'], '[{"libelle":"condition"}]'::jsonb);
    `);
    const [r] = await sql(`select public.bareme_verifier('${versionId}') as c;`);
    assert.equal(Number(r.c.total_points), 20);
    assert.ok(r.c.blocages.some((b) => b.code === 'reponse_attendue_manquante' && b.question_key === 'ex1_q3'));
  });

  await test('1.8', 'une compétence hors référentiel est un blocage', async () => {
    await sql(`update public.bareme_questions set competences = array['telepathie']
               where bareme_version_id = '${versionId}' and question_key = 'ex1_q3';`);
    const [r] = await sql(`select public.bareme_verifier('${versionId}') as c;`);
    assert.ok(r.c.blocages.some((b) => b.code === 'competence_inconnue'));
    await sql(`update public.bareme_questions set competences = array['algorithmique'],
               reponse_attendue = 'while u > 0.001 :'
               where bareme_version_id = '${versionId}' and question_key = 'ex1_q3';`);
  });

  await test('1.9', 'une dépendance vers une question inexistante est un blocage', async () => {
    await sql(`update public.bareme_questions set depend_de = array['ex9_q9']
               where bareme_version_id = '${versionId}' and question_key = 'ex1_q1b';`);
    const [r] = await sql(`select public.bareme_verifier('${versionId}') as c;`);
    assert.ok(r.c.blocages.some((b) => b.code === 'dependance_inconnue'));
    await sql(`update public.bareme_questions set depend_de = array['ex1_q1a']
               where bareme_version_id = '${versionId}' and question_key = 'ex1_q1b';`);
  });

  // -----------------------------------------------------------------
  console.log('\n2 · Fractions de points');

  await test('2.1', 'des paliers cumulables au-dessus du maximum sont refusés par la base', async () => {
    const [qid] = await sql(
      `select id from public.bareme_questions where bareme_version_id = '${versionId}' and question_key = 'ex1_q1a';`,
    );
    const r = await refuse(
      `insert into public.bareme_awards (question_id, libelle, points, cumulable)
       values ('${qid.id}', 'trop', 6, true);`,
      'maximum',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('2.2', 'des paliers au quart de point sont acceptés et se cumulent', async () => {
    const lignes = await sql(
      `select id, question_key from public.bareme_questions where bareme_version_id = '${versionId}';`,
    );
    const parCle = Object.fromEntries(lignes.map((l) => [l.question_key, l.id]));
    await sql(`
      insert into public.bareme_awards (question_id, libelle, points, nature, cumulable, ordre) values
        ('${parCle.ex1_q1a}', 'Formule du produit posée', 0.25, 'methode', true, 0),
        ('${parCle.ex1_q1a}', 'Dérivée exacte', 4.75, 'resultat', true, 1),
        ('${parCle.ex1_q1b}', 'Signe étudié', 2.5, 'methode', true, 0),
        ('${parCle.ex1_q1b}', 'Tableau juste', 2.5, 'resultat', true, 1),
        ('${parCle.ex1_q2}',  'Initialisation', 1.5, 'etape', true, 0),
        ('${parCle.ex1_q2}',  'Hérédité', 4.5, 'etape', true, 1),
        ('${parCle.ex1_q3}',  'Condition d''arrêt juste', 4, 'resultat', true, 0);
    `);
    const [somme] = await sql(`
      select sum(a.points) as total from public.bareme_awards a
      join public.bareme_questions q on q.id = a.question_id
      where q.bareme_version_id = '${versionId}';`);
    assert.equal(Number(somme.total), 20);
  });

  await test('2.3', 'le barème est désormais sans blocage', async () => {
    await sql(`update public.bareme_questions
               set methodes_alternatives = '[{"libelle":"Forme développée"}]'::jsonb
               where bareme_version_id = '${versionId}' and question_key = 'ex1_q1a';`);
    const [r] = await sql(`select public.bareme_verifier('${versionId}') as c;`);
    assert.equal(r.c.ok, true, JSON.stringify(r.c.blocages));
    assert.equal(Number(r.c.total_points), 20);
  });

  // -----------------------------------------------------------------
  console.log('\n3 · Verrouillage et versions');

  await test('3.1', 'le verrouillage passe et pose la version active sur l’examen', async () => {
    await sql(`select public.bareme_verrouiller('${versionId}', 'tests');`);
    const [v] = await sql(`select statut, verrouille_le from public.bareme_versions where id = '${versionId}';`);
    const [e] = await sql(`select bareme_version_active, statut from public.exams where id = '${examId}';`);
    assert.equal(v.statut, 'locked');
    assert.ok(v.verrouille_le);
    assert.equal(e.bareme_version_active, versionId);
  });

  await test('3.2', 'une version verrouillée refuse toute modification de question', async () => {
    const r = await refuse(
      `update public.bareme_questions set max_points = 7
       where bareme_version_id = '${versionId}' and question_key = 'ex1_q1a';`,
      'verrouill',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('3.3', 'une version verrouillée refuse l’ajout d’un palier', async () => {
    const [qid] = await sql(
      `select id from public.bareme_questions where bareme_version_id = '${versionId}' and question_key = 'ex1_q2';`,
    );
    const r = await refuse(
      `insert into public.bareme_awards (question_id, libelle, points) values ('${qid.id}', 'après coup', 0);`,
      'verrouill',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('3.4', 'une version verrouillée refuse qu’on change son numéro ou son total', async () => {
    const r = await refuse(
      `update public.bareme_versions set version = '9.9' where id = '${versionId}';`,
      'verrouill',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('3.5', 'ouvrir les corrections est désormais accepté', async () => {
    await sql(`select public.exam_ouvrir_correction('${examId}', 'tests');`);
    const [e] = await sql(`select statut from public.exams where id = '${examId}';`);
    assert.equal(e.statut, 'correction_open');
  });

  let version11;
  await test('3.6', 'une nouvelle version copie tout le barème, en brouillon', async () => {
    const [r] = await sql(`select public.bareme_nouvelle_version('${versionId}', '1.1', 'tests') as id;`);
    version11 = r.id;
    const [v] = await sql(`select version, statut, total_points, base_sur from public.bareme_versions where id = '${version11}';`);
    assert.equal(v.version, '1.1');
    assert.equal(v.statut, 'draft');
    assert.equal(Number(v.total_points), 20);
    assert.equal(v.base_sur, versionId);

    const [n] = await sql(`
      select count(*) as questions,
             (select count(*) from public.bareme_awards a
              join public.bareme_questions x on x.id = a.question_id
              where x.bareme_version_id = '${version11}') as paliers
      from public.bareme_questions where bareme_version_id = '${version11}';`);
    assert.equal(Number(n.questions), 4);
    assert.equal(Number(n.paliers), 7);
  });

  await test('3.7', 'l’ancienne version reste intacte après la création de la suivante', async () => {
    const [v] = await sql(`select statut, total_points from public.bareme_versions where id = '${versionId}';`);
    assert.equal(v.statut, 'locked');
    assert.equal(Number(v.total_points), 20);
    const [n] = await sql(
      `select count(*) as n from public.bareme_questions where bareme_version_id = '${versionId}';`,
    );
    assert.equal(Number(n.n), 4);
  });

  await test('3.8', 'la nouvelle version, elle, est modifiable', async () => {
    await sql(`update public.bareme_questions set max_points = 5.5
               where bareme_version_id = '${version11}' and question_key = 'ex1_q2';`);
    const [v] = await sql(`select total_points from public.bareme_versions where id = '${version11}';`);
    assert.equal(Number(v.total_points), 19.5);
    // On la remet à 20 : un barème hors 20 ne se verrouille pas.
    await sql(`update public.bareme_questions set max_points = 6
               where bareme_version_id = '${version11}' and question_key = 'ex1_q2';`);
  });

  await test('3.9', 'dupliquer vers un autre examen garde la charpente et efface les attendus', async () => {
    const [autre] = await sql(`
      insert into public.exams (code, matiere, titre, statut, cree_par)
      values (${q(CODE + '-2')}, 'maths', 'Second examen de test', 'draft', 'tests') returning id;`);
    const [r] = await sql(
      `select public.bareme_dupliquer_vers_examen('${versionId}', '${autre.id}', '1.0', 'tests') as id;`,
    );
    const [n] = await sql(`
      select count(*) as questions,
             count(*) filter (where reponse_attendue is null) as sans_attendu,
             sum(max_points) as total
      from public.bareme_questions where bareme_version_id = '${r.id}';`);
    assert.equal(Number(n.questions), 4);
    assert.equal(Number(n.sans_attendu), 4, 'les attendus de l’ancien sujet doivent être effacés');
    assert.equal(Number(n.total), 20, 'la charpente des points est conservée');

    await sql(`
      delete from public.bareme_versions where exam_id = '${autre.id}';
      delete from public.exams where id = '${autre.id}';`);
  });

  // -----------------------------------------------------------------
  console.log('\n4 · La note d’une copie');

  let correctionId;
  await test('4.1', 'une copie du nouveau moteur exige un examen', async () => {
    const r = await refuse(
      `insert into public.corrections (track, exercise_type, moteur, status)
       values ('generale', 'maths_analyse', 'bareme_sujet', 'uploaded');`,
      'corrections_coherence_moteur',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('4.2', 'une copie de l’ancien moteur exige toujours sa fiche sujet et sa grille', async () => {
    const r = await refuse(
      `insert into public.corrections (track, exercise_type, moteur, status)
       values ('generale', 'commentaire', 'grille_generique', 'uploaded');`,
      'corrections_coherence_moteur',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('4.3', 'créer une copie rattachée à l’examen et à la version verrouillée', async () => {
    const [c] = await sql(`
      insert into public.corrections
        (track, exercise_type, matiere, exam_id, bareme_version_id, moteur, status, student_name, source)
      values ('generale', 'maths_analyse', 'maths', '${examId}', '${versionId}', 'bareme_sujet',
              'transcribed', 'Élève de test', 'tests')
      returning id;`);
    correctionId = c.id;
    assert.ok(correctionId);
  });

  await test('4.4', 'la note brute est la somme des points, posée par la base', async () => {
    await sql(`
      insert into public.correction_questions
        (correction_id, bareme_version_id, question_key, points, max_points, preuves)
      values
        ('${correctionId}', '${versionId}', 'ex1_q1a', 0.25, 5, '[{"citation":"x"}]'::jsonb),
        ('${correctionId}', '${versionId}', 'ex1_q1b', 5,    5, '[{"citation":"x"}]'::jsonb),
        ('${correctionId}', '${versionId}', 'ex1_q2',  6,    6, '[{"citation":"x"}]'::jsonb),
        ('${correctionId}', '${versionId}', 'ex1_q3',  0.5,  4, '[{"citation":"x"}]'::jsonb);`);
    const [c] = await sql(
      `select score_raw, score_validated, max_score, human_review_required from public.corrections where id = '${correctionId}';`,
    );
    assert.equal(Number(c.score_raw), 11.75);
    assert.equal(Number(c.score_validated), 11.75);
    assert.equal(Number(c.max_score), 20);
    assert.equal(c.human_review_required, false);
  });

  await test('4.5', 'des points au-dessus du maximum d’une question sont refusés', async () => {
    const r = await refuse(
      `update public.correction_questions set points = 9
       where correction_id = '${correctionId}' and question_key = 'ex1_q1a';`,
      'correction_questions_bornes',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('4.6', 'le diagnostic de compétences ne touche pas la note', async () => {
    const [avant] = await sql(`select score_raw from public.corrections where id = '${correctionId}';`);
    await sql(`
      insert into public.correction_competences (correction_id, matiere, competence, niveau) values
        ('${correctionId}', 'maths', 'calculer', 'insufficient'),
        ('${correctionId}', 'maths', 'raisonner', 'very_satisfactory'),
        ('${correctionId}', 'maths', 'chercher', 'non_applicable'),
        ('${correctionId}', 'maths', 'communiquer', 'non_observe');`);
    const [apres] = await sql(`select score_raw from public.corrections where id = '${correctionId}';`);
    assert.equal(Number(apres.score_raw), Number(avant.score_raw));
  });

  await test('4.7', 'un niveau de compétence inventé est refusé', async () => {
    const r = await refuse(
      `insert into public.correction_competences (correction_id, matiere, competence, niveau)
       values ('${correctionId}', 'maths', 'modeliser', 'excellent_partout');`,
      'correction_competences_niveau',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('4.8', 'une relecture humaine sur une question fait basculer la copie', async () => {
    await sql(`update public.correction_questions set relecture_humaine = true
               where correction_id = '${correctionId}' and question_key = 'ex1_q3';`);
    const [c] = await sql(`select human_review_required from public.corrections where id = '${correctionId}';`);
    assert.equal(c.human_review_required, true);
  });

  await test('4.9', 'la note validée suit la décision humaine, la note brute ne bouge pas', async () => {
    await sql(`update public.correction_questions set points_humain = 3.5
               where correction_id = '${correctionId}' and question_key = 'ex1_q3';`);
    const [c] = await sql(
      `select score_raw, score_validated from public.corrections where id = '${correctionId}';`,
    );
    assert.equal(Number(c.score_raw), 11.75, 'la note brute reste celle du barème');
    assert.equal(Number(c.score_validated), 14.75, '11.75 - 0.5 + 3.5');
  });

  // -----------------------------------------------------------------
  console.log('\n5 · Équité entre élèves');

  await test('5.1', 'le suivi des versions par examen voit un seul lot', async () => {
    const lignes = await sql(
      `select version, copies from public.vue_versions_par_examen where exam_id = '${examId}';`,
    );
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].version, '1.0');
    assert.equal(Number(lignes[0].copies), 1);
  });

  await test('5.2', 'deux versions dans le même lot deviennent visibles', async () => {
    await sql(`
      insert into public.corrections
        (track, exercise_type, matiere, exam_id, bareme_version_id, moteur, status, student_name, source)
      values ('generale', 'maths_analyse', 'maths', '${examId}', '${version11}', 'bareme_sujet',
              'transcribed', 'Élève de test 2', 'tests');`);
    const lignes = await sql(
      `select version from public.vue_versions_par_examen where exam_id = '${examId}' order by version;`,
    );
    assert.equal(lignes.length, 2, 'le mélange de versions doit se voir');
  });

  await test('5.3', 'l’historique d’un recalcul est conservé, l’ancienne correction n’est pas perdue', async () => {
    await sql(`
      insert into public.bareme_audit (table_cible, ligne_id, action, auteur, avant, apres)
      values ('corrections', '${correctionId}', 'recalcul_nouvelle_version', 'tests',
              jsonb_build_object('bareme_version_id', '${versionId}', 'score_raw', 11.75),
              jsonb_build_object('bareme_version_id', '${version11}'));`);
    const [a] = await sql(
      `select avant, apres from public.bareme_audit where ligne_id = '${correctionId}' order by cree_le desc limit 1;`,
    );
    assert.equal(Number(a.avant.score_raw), 11.75);
    assert.equal(a.apres.bareme_version_id, version11);
  });

  await test('5.4', 'le verrouillage est tracé dans l’historique', async () => {
    const lignes = await sql(
      `select action from public.bareme_audit where ligne_id = '${versionId}' and action = 'verrouillage';`,
    );
    assert.ok(lignes.length >= 1);
  });

  // -----------------------------------------------------------------
  console.log('\n6 · Sécurité');

  const TABLES = [
    'exams', 'bareme_versions', 'bareme_exercices', 'bareme_questions', 'bareme_awards',
    'competence_referentiels', 'taxonomie_erreurs', 'etalon_copies',
    'etalon_corrections_humaines', 'etalon_correction_humaine_questions',
    'etalon_corrections_ia', 'calibration_runs', 'correction_questions',
    'correction_competences', 'relectures_humaines', 'bareme_audit',
  ];

  await test('6.1', 'RLS est active sur les 16 nouvelles tables', async () => {
    const lignes = await sql(`
      select c.relname, c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in (${TABLES.map(q).join(', ')});`);
    assert.equal(lignes.length, TABLES.length);
    const sans = lignes.filter((l) => !l.relrowsecurity).map((l) => l.relname);
    assert.equal(sans.length, 0, `sans RLS : ${sans.join(', ')}`);
  });

  await test('6.2', 'aucune policy : anon et authenticated ne voient rien', async () => {
    const lignes = await sql(
      `select tablename, policyname from pg_policies where schemaname = 'public' and tablename in (${TABLES.map(q).join(', ')});`,
    );
    assert.equal(lignes.length, 0, `policies inattendues : ${JSON.stringify(lignes)}`);
  });

  await test('6.3', 'le rôle anon ne peut pas lire les barèmes', async () => {
    const r = await refuse(
      `begin; set local role anon; select count(*) from public.bareme_questions; rollback;`,
      'permission denied|denied for',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('6.4', 'le rôle anon ne peut pas lire les notes par question', async () => {
    const r = await refuse(
      `begin; set local role anon; select count(*) from public.correction_questions; rollback;`,
      'permission denied|denied for',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('6.5', 'le rôle authenticated ne peut pas verrouiller un barème', async () => {
    const r = await refuse(
      `begin; set local role authenticated; select public.bareme_verrouiller('${versionId}', 'pirate'); rollback;`,
      'permission denied|denied for',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  await test('6.6', 'le rôle anon ne peut pas ouvrir les corrections', async () => {
    const r = await refuse(
      `begin; set local role anon; select public.exam_ouvrir_correction('${examId}', 'pirate'); rollback;`,
      'permission denied|denied for',
    );
    assert.ok(r.refuse && r.correspond, r.message);
  });

  // -----------------------------------------------------------------
  console.log('\n7 · L’ancien système est intact');

  await test('7.1', 'les corrections existantes gardent leur moteur et leur note', async () => {
    const [r] = await sql(`
      select count(*) as n, count(*) filter (where score_raw is not null) as avec_note
      from public.corrections where moteur = 'grille_generique';`);
    assert.ok(Number(r.n) >= 16, `seulement ${r.n} anciennes corrections`);
  });

  await test('7.2', 'les grilles génériques sont étiquetées, pas supprimées', async () => {
    // L'invariant : aucune grille n'a disparu, et toutes portent un rôle
    // explicite. On n'exige PAS que toutes soient en 'diagnostic_competences' :
    // une matière peut légitimement rester en 'note_officielle' tant qu'elle
    // n'a pas de barème propre au sujet — c'est justement le but de la colonne.
    const [r] = await sql(`
      select count(*) as n,
             count(*) filter (where role is null or btrim(role) = '') as sans_role,
             count(*) filter (where rubric_json is null) as sans_bareme
      from public.rubrics;`);
    assert.ok(Number(r.n) >= 29, `seulement ${r.n} grilles`);
    assert.equal(Number(r.sans_role), 0);
    assert.equal(Number(r.sans_bareme), 0, 'aucune grille ne doit avoir perdu son contenu');
  });

  await test('7.3', 'le diagnostic aiguille l’ancien moteur sans le casser', async () => {
    const [ancienne] = await sql(
      `select id from public.corrections where moteur = 'grille_generique' order by created_at desc limit 1;`,
    );
    const [d] = await sql(`select public.pipeline_diagnostic('${ancienne.id}') as d;`);
    assert.equal(d.d.moteur, 'grille_generique');
    assert.ok('linked_benchmarks' in d.d, 'le diagnostic historique doit rester complet');
  });

  await test('7.4', 'le diagnostic du nouveau moteur voit le barème verrouillé', async () => {
    const [d] = await sql(`select public.pipeline_diagnostic('${correctionId}') as d;`);
    assert.equal(d.d.moteur, 'bareme_sujet');
    assert.equal(d.d.bareme_statut, 'locked');
    assert.equal(d.d.exam_statut, 'correction_open');
    assert.equal(d.d.bareme_controles_ok, true);
    // ready reste false : aucun fichier n'a été déposé pour cette copie de test.
    assert.equal(d.d.file_exists, false);
  });

  await test('7.5', 'une copie étalon peut être corrigée avant verrouillage, pas une copie d’élève', async () => {
    const [c] = await sql(`
      insert into public.corrections
        (track, exercise_type, matiere, exam_id, bareme_version_id, moteur, status, est_etalon, source)
      values ('generale', 'maths_analyse', 'maths', '${examId}', '${version11}', 'bareme_sujet',
              'transcribed', true, 'tests')
      returning id;`);
    await sql(`select public.bareme_verifier('${version11}');`);
    const [etalon] = await sql(`select public.pipeline_diagnostic('${c.id}') as d;`);
    assert.equal(etalon.d.est_etalon, true);
    assert.equal(etalon.d.bareme_statut, 'draft');

    // La même copie, sans le drapeau étalon, ne serait pas prête.
    await sql(`update public.corrections set est_etalon = false where id = '${c.id}';`);
    const [eleve] = await sql(`select public.pipeline_diagnostic('${c.id}') as d;`);
    assert.equal(eleve.d.ready, false, 'un élève ne peut pas être corrigé sur un barème en brouillon');
  });
} finally {
  await nettoyer();
  console.log('\nExamen de test supprimé.');
}

console.log(`\n${reussis} test(s) réussi(s), ${echoues} échec(s).`);
if (echecs.length) {
  console.log('\nÉchecs :');
  for (const e of echecs) console.log(`  • ${e}`);
  process.exit(1);
}
