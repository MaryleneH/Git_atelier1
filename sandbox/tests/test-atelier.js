/* Tests du moteur pour le bac à sable de l'atelier 1.
   Run: node tests/test-atelier.js

   Ils utilisent le vrai projet du site (assets/js/bac-a-sable.js) et
   vérifient les comportements dont dépend la pédagogie :

   A. modifier un fichier (comme l'éditeur l'enregistre) → status le voit
   B. modifier → add → la zone de sélection contient la bonne version
   C. modifier → add → modifier encore → deux versions différentes
   D. git diff = répertoire de travail vs zone de sélection
   E. git diff --staged = zone de sélection vs dernier commit
   F. git commit enregistre la version sélectionnée
   G. git restore <fichier> reprend la version de la zone de sélection
   H. git restore --staged <fichier> retire de la sélection sans toucher au fichier
   J. R et Python : même logique Git
   + les missions, déroulées pas à pas, cochent toutes leurs étapes. */
const git = require('isomorphic-git');
const Core = require('../src/sandbox-core.js');
const Bac = require('../../assets/js/bac-a-sable.js');

let pass = 0, fail = 0;
const failures = [];
function check(label, cond, detail) {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? '\n     ' + String(detail).split('\n').slice(0, 14).join('\n     ') : '')); }
}
const strip = (s) => String(s).replace(/\{[grybw\/]\}/g, '');

async function sandbox() {
  const sb = Core.createSandbox({ git, displayDir: '~/entreprises_defense' });
  const run = async (line) => { const r = await sb.run(line); return { ...r, out: strip(r.out) }; };
  return { sb, run };
}

// Une mission déroulée comme dans la page : même état de départ, mêmes
// contrôles, mêmes événements (open / save / cmd / answer)
async function mission(id, lang) {
  const def = Bac.missions[id];
  const { sb, run } = await sandbox();
  await sb.reset((s) => def.seed(s, lang));
  const startOid = await sb.headOid();
  const events = [];
  const answers = {};
  const done = {};
  async function evaluate() {
    const graph = await sb.graphModel();
    const status = await sb.statusModel();
    const cache = {};
    const versions = async (p) => (cache[p] = cache[p] || await sb.fileVersions(p));
    const ctx = {
      lang, f: (n) => Bac.fileFor(lang, n),
      model: { isRepo: await sb.isRepo(), commits: graph.commits },
      status, events, last: events[events.length - 1] || null, startOid,
      answer: (q) => answers[q],
      opened: (p) => events.some((e) => e.type === 'open' && e.file === p),
      work: async (p) => (await versions(p)).work,
      index: async (p) => (await versions(p)).index,
      head: async (p) => (await versions(p)).head,
      readAt: (oid, p) => sb.readAt(oid, p),
      newCommits: () => {
        const out = [];
        for (const c of graph.commits) { if (c.oid === startOid) break; out.push(c); }
        return out;
      }
    };
    for (const [k, fn] of Object.entries(def.checks)) {
      if (!done[k] && await fn(ctx)) done[k] = true;
    }
  }
  const api = {
    sb, run, done, def,
    f: (n) => Bac.fileFor(lang, n),
    async open(p) { events.push({ type: 'open', file: p }); await evaluate(); },
    async edit(p, fn) {           // l'éditeur : modifier puis enregistrer
      await sb.writeFile(p, fn(await sb.readFile(p)));
      events.push({ type: 'save', file: p });
      await evaluate();
    },
    async cmd(line) {
      const r = await run(line);
      events.push({ type: 'cmd', line, ok: r.ok });
      await evaluate();
      return r;
    },
    async answer(q, v) { answers[q] = v; events.push({ type: 'answer', id: q, value: v }); await evaluate(); },
    allDone() { return Object.keys(def.checks).every((k) => done[k]); },
    missing() { return Object.keys(def.checks).filter((k) => !done[k]).join(', '); }
  };
  return api;
}

(async () => {
  for (const lang of ['R', 'Python']) {
    const L = (s) => lang + ' :: ' + s;
    const seuil = (v) => Bac.EDITS.seuil(lang, v);
    const re = (v) => new RegExp('seuil_dependance (<-|=) ' + v.replace('.', '\\.'));

    /* ---------------------- A à H sur le projet ---------------------- */
    {
      const m = await mission('mission-1', lang);
      const p = m.f('02_nettoyage');
      let r = await m.cmd('git status');
      check(L('état de départ propre (brouillon non suivi seulement)'),
        /Untracked files/.test(r.out) && new RegExp('\\t' + m.f('brouillon_test')).test(r.out) &&
        !/Changes/.test(r.out) && !/data\//.test(r.out) && !/sorties/.test(r.out), r.out);

      // A
      await m.edit(p, seuil('0.10'));
      r = await m.cmd('git status');
      check(L('A. status voit le fichier modifié'),
        /Changes not staged for commit:/.test(r.out) && new RegExp('modified:\\s+' + p.replace('.', '\\.')).test(r.out), r.out);
      check(L('A. status donne les aides de Git'), /use "git restore <file>\.\.\." to discard/.test(r.out) && /no changes added to commit/.test(r.out), r.out);

      // D (avant add : travail vs sélection = travail vs dépôt)
      r = await m.cmd('git diff');
      check(L('D. diff montre -0.20 +0.10'),
        /^-seuil_dependance (<-|=) 0\.20$/m.test(r.out) && /^\+seuil_dependance (<-|=) 0\.10$/m.test(r.out) &&
        /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/m.test(r.out) && /^index [0-9a-f]{7}\.\.[0-9a-f]{7} 100644$/m.test(r.out), r.out);
      r = await m.cmd('git diff --staged');
      check(L('E. diff --staged vide avant add'), r.ok && r.out === '', r.out);

      // B
      await m.cmd('git add ' + p);
      const v1 = await m.sb.fileVersions(p);
      check(L('B. la sélection contient 0.10'), re('0.10').test(v1.index) && re('0.20').test(v1.head), JSON.stringify(v1));
      r = await m.cmd('git diff');
      check(L('D. diff vide juste après add'), r.ok && r.out === '', r.out);
      r = await m.cmd('git diff --staged');
      check(L('E. diff --staged montre -0.20 +0.10'), /^-.*0\.20$/m.test(r.out) && /^\+.*0\.10$/m.test(r.out), r.out);

      // C (même longueur, juste après add : le piège du cache de fichiers)
      await m.edit(p, seuil('0.15'));
      const v2 = await m.sb.fileVersions(p);
      check(L('C. trois versions différentes'), re('0.15').test(v2.work) && re('0.10').test(v2.index) && re('0.20').test(v2.head), JSON.stringify(v2));
      r = await m.cmd('git status');
      check(L('C. le fichier est dans les deux listes'),
        /Changes to be committed:[\s\S]*modified:\s+scripts\/02[\s\S]*Changes not staged for commit:[\s\S]*modified:\s+scripts\/02/.test(r.out), r.out);
      r = await m.cmd('git diff');
      check(L('D. diff = travail vs sélection : -0.10 +0.15'), /^-.*0\.10$/m.test(r.out) && /^\+.*0\.15$/m.test(r.out) && !/0\.20/.test(r.out), r.out);
      r = await m.cmd('git diff --staged');
      check(L('E. diff --staged = sélection vs dépôt : -0.20 +0.10'), /^-.*0\.20$/m.test(r.out) && /^\+.*0\.10$/m.test(r.out) && !/0\.15/.test(r.out), r.out);

      // H
      r = await m.cmd('git restore --staged ' + p);
      const v3 = await m.sb.fileVersions(p);
      check(L('H. restore --staged : sélection = dépôt, travail intact'),
        r.ok && v3.index === v3.head && re('0.15').test(v3.work), JSON.stringify(v3));

      // G (sélection = dépôt maintenant)
      await m.cmd('git add ' + p);
      await m.edit(p, seuil('0.30'));
      r = await m.cmd('git restore ' + p);
      const v4 = await m.sb.fileVersions(p);
      check(L('G. restore reprend la version sélectionnée (0.15), pas celle du dépôt'),
        r.ok && re('0.15').test(v4.work) && v4.work === v4.index, JSON.stringify(v4));

      // F
      r = await m.cmd('git commit -m "Abaisse le seuil de dépendance défense à 15 %"');
      const v5 = await m.sb.fileVersions(p);
      check(L('F. commit enregistre la version sélectionnée'),
        r.ok && /\[main [0-9a-f]{7}\] Abaisse/.test(r.out) && /1 file changed, 1 insertion\(\+\), 1 deletion\(-\)/.test(r.out) &&
        re('0.15').test(v5.head), r.out + '\n' + JSON.stringify(v5));
      r = await m.cmd('git status');
      check(L('F. status propre sauf le brouillon'), /nothing added to commit but untracked files present/.test(r.out), r.out);

      // G bis : sans rien de sélectionné, restore reprend le dernier commit
      await m.edit(p, seuil('0.99'));
      await m.cmd('git restore ' + p);
      check(L('G. restore sans sélection = version du dernier commit'), re('0.15').test(await m.sb.readFile(p)));

      // show, log, restore --source
      r = await m.cmd('git log --oneline');
      check(L('log --oneline : 3 commits, HEAD -> main'), r.out.split('\n').length === 3 && /\(HEAD -> main\)/.test(r.out), r.out);
      r = await m.cmd('git log');
      check(L('log : ligne Date'), /^Date:\s+Tue Oct 6 15:02:00 2026 \+0200$/m.test(r.out), r.out);
      r = await m.cmd('git show');
      check(L('show : en-tête et diff du dernier commit'), /^commit [0-9a-f]{40}/.test(r.out) && /Author: Vous <vous@exemple\.fr>/.test(r.out) && /^\+.*0\.15$/m.test(r.out), r.out);
      const first = (await m.sb.graphModel()).commits.slice(-1)[0].short;
      r = await m.cmd('git restore --source=' + first + ' ' + p);
      check(L('restore --source : version du premier commit'), r.ok && re('0.20').test(await m.sb.readFile(p)), r.out);
      r = await m.cmd('git restore inexistant.R');
      check(L('restore : pathspec inconnu'), !r.ok && /did not match any file\(s\) known to git/.test(r.out), r.out);

      // .gitignore
      r = await m.cmd('git add data/entreprises_defense_2024.csv');
      check(L('add refuse un fichier ignoré'), !r.ok && /ignored by one of your \.gitignore files/.test(r.out) && /^data$/m.test(r.out), r.out);
      r = await m.cmd('git add .');
      const st = await m.sb.statusModel();
      check(L('add . ne prend ni data/ ni sorties/'), !st.staged.some((s) => /^(data|sorties)\//.test(s.file)) && st.staged.some((s) => s.file === m.f('brouillon_test')), JSON.stringify(st));
    }

    /* ------------------- les missions, pas à pas --------------------- */
    {
      const m = await mission('prise-en-main', lang);
      let r = await m.cmd('git status');
      check(L('prise en main : pas de dépôt au départ'), !r.ok && /not a git repository/.test(r.out), r.out);
      await m.open('README.md');
      await m.cmd('git init');
      r = await m.cmd('git status');
      check(L('prise en main : dossiers non suivis regroupés'), /\tdata\/\n/.test(r.out) && /\tscripts\/\n/.test(r.out) && /No commits yet/.test(r.out), r.out);
      await m.cmd('git add README.md scripts/ rapport.qmd');
      r = await m.cmd('git commit -m "Initialise le suivi de l\'étude entreprises_defense"');
      check(L('prise en main : root-commit'), /\(root-commit\)/.test(r.out) && /5 files changed/.test(r.out), r.out);
      await m.cmd('git log --oneline');
      check(L('prise en main : toutes les étapes'), m.allDone(), m.missing());
    }
    {
      const m = await mission('mission-1', lang);
      await m.open(m.f('02_nettoyage'));
      await m.edit(m.f('02_nettoyage'), seuil('0.10'));
      await m.cmd('git status');
      await m.cmd('git diff');
      await m.answer('m1', 'non');
      check(L('mission 1 : toutes les étapes'), m.allDone(), m.missing());
    }
    {
      const m = await mission('mission-2', lang);
      await m.edit('rapport.qmd', Bac.EDITS.rapport10);
      await m.cmd('git status');
      await m.cmd('git diff');
      await m.cmd('git add ' + m.f('02_nettoyage') + ' rapport.qmd');
      await m.cmd('git status');
      await m.cmd('git diff --staged');
      const r = await m.cmd('git commit -m "Abaisse le seuil de dépendance défense à 10 %"');
      await m.cmd('git log --oneline');
      check(L('mission 2 : commit de 2 fichiers'), /2 files changed, 2 insertions\(\+\), 2 deletions\(-\)/.test(r.out), r.out);
      check(L('mission 2 : toutes les étapes'), m.allDone(), m.missing());
      check(L('mission 2 : brouillon toujours hors du dépôt'), (await m.sb.fileVersions(m.f('brouillon_test'))).head === null);
    }
    {
      const m = await mission('mission-2', lang);
      await m.edit('rapport.qmd', Bac.EDITS.rapport10);
      await m.cmd('git add .');   // tout, brouillon compris
      await m.cmd('git commit -m "modif"');
      check(L('mission 2 : "git add ." + "modif" ne valide pas'), !m.done['m2-commit'] && !m.done['m2-message'] && !m.done['m2-add']);
    }
    {
      const m = await mission('mission-3', lang);
      const p = m.f('02_nettoyage');
      await m.cmd('git add ' + p);
      await m.open(p);
      await m.edit(p, seuil('0.15'));
      await m.cmd('git status');
      await m.cmd('git diff');
      await m.cmd('git diff --staged');
      await m.cmd('git add ' + p);
      check(L('mission 3 : toutes les étapes'), m.allDone(), m.missing());
    }
    {
      const m = await mission('mission-4', lang);
      const p = m.f('03_analyse');
      await m.open(p);
      await m.edit(p, Bac.EDITS.accident(lang));
      await m.cmd('git status');
      const d = await m.cmd('git diff');
      check(L('mission 4 : le diff montre taille → departement'), /^-.*taille/m.test(d.out) && /^\+.*departement/m.test(d.out), d.out);
      await m.cmd('git restore ' + p);
      const s = await m.cmd('git status');
      check(L('mission 4 : propre après restore'), /nothing added to commit but untracked files present/.test(s.out), s.out);
      check(L('mission 4 : toutes les étapes'), m.allDone(), m.missing());
    }
    {
      const m = await mission('defi', lang);
      await m.edit(m.f('03_analyse'), Bac.EDITS.defiScript(lang));
      await m.edit('rapport.qmd', Bac.EDITS.defiRapport);
      await m.cmd('git status');
      await m.cmd('git diff');
      await m.cmd('git add ' + m.f('03_analyse') + ' rapport.qmd');
      await m.cmd('git diff --staged');
      await m.cmd('git commit -m "Ventile les résultats par département"');
      await m.cmd('git log --oneline');
      check(L('défi : toutes les étapes'), m.allDone(), m.missing());
    }
  }

  /* J : mêmes empreintes de contenu, même logique : le parcours Git ne dépend
     que des fichiers de traitement, qui changent d'extension */
  const rR = Object.keys(Bac.fichiers('R')).map((p) => p.replace(/\.R$/, '.X'));
  const rP = Object.keys(Bac.fichiers('Python')).map((p) => p.replace(/\.py$/, '.X'));
  check('J. mêmes fichiers en R et en Python, à l\'extension près', JSON.stringify(rR) === JSON.stringify(rP), rR + '\n' + rP);

  console.log('\n===== atelier (moteur + missions) =====');
  console.log('passed: ' + pass + '   failed: ' + fail);
  if (failures.length) {
    console.log('\nFAILURES:');
    failures.forEach((f) => console.log(' - ' + f));
    process.exitCode = 1;
  }
})();
