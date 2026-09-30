/* Test de bout en bout du bac à sable, dans un vrai navigateur (Chromium).

     quarto render && (cd _site && python3 -m http.server 8765) &
     node sandbox/tests/e2e-bac-a-sable.js [url] [dossier-captures]

   Nécessite Playwright. Joue le parcours comme un stagiaire : clics dans
   l'explorateur, frappe au clavier dans l'éditeur, Ctrl+S, commandes tapées
   dans le terminal. Vérifie les checklists, les trois zones, et que
   l'éditeur suit le filesystem après restore, Annuler et Recommencer. */
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) {
  try { ({ chromium } = require(process.env.PW || 'playwright')); }
  catch (e2) { console.log('Playwright absent : test ignoré'); process.exit(0); }
}

const URL = process.argv[2] || 'http://localhost:8765/bac-a-sable.html';
const SHOTS = process.argv[3] || null;

let pass = 0, fail = 0;
const failures = [];
function check(label, cond, detail) {
  if (cond) pass++;
  else { fail++; failures.push(label + (detail ? '\n     ' + String(detail).slice(0, 700) : '')); }
}

(async () => {
  const browser = await chromium.launch();

  async function page(width, height) {
    const p = await browser.newPage({ viewport: { width, height } });
    p.on('pageerror', (e) => { fail++; failures.push('erreur JavaScript : ' + e.message); });
    p.on('dialog', (d) => d.accept());
    await p.goto(URL, { waitUntil: 'networkidle' }).catch(() => {});
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await p.reload({ waitUntil: 'networkidle' }).catch(() => {});
    await p.waitForSelector('.gw-node', { state: 'attached' });
    await p.waitForTimeout(400);
    return p;
  }

  const helpers = (p) => ({
    async cmd(line) {
      await p.fill('.gw-cmd', line);
      await p.press('.gw-cmd', 'Enter');
      await p.waitForFunction(() => !document.querySelector('.gw-cmd').disabled);
      await p.waitForTimeout(150);
      return p.evaluate(() => { const l = [...document.querySelectorAll('.gw-out .gw-line')]; return l.slice(-40).map((x) => x.textContent).join('\n'); });
    },
    async open(name) {
      await p.click('.gw-node-file[data-file="' + name + '"]');
      await p.waitForTimeout(150);
    },
    // remplace `from` par `to` dans l'éditeur en tapant au clavier
    async type(from, to) {
      const pos = await p.evaluate((f) => document.querySelector('.gw-text').value.indexOf(f), from);
      if (pos < 0) throw new Error('texte introuvable dans l\'éditeur : ' + from);
      await p.evaluate(([a, b]) => { const t = document.querySelector('.gw-text'); t.focus(); t.setSelectionRange(a, b); }, [pos, pos + from.length]);
      await p.keyboard.type(to);
      await p.waitForTimeout(100);
    },
    async save() { await p.keyboard.press('Control+s'); await p.waitForTimeout(250); },
    text() { return p.evaluate(() => document.querySelector('.gw-text').value); },
    edState() { return p.evaluate(() => document.querySelector('.gw-ed-state').textContent); },
    done() { return p.evaluate(() => [...document.querySelectorAll('.gw-mission-panel .gw-check')].map((li) => li.classList.contains('is-done'))); },
    allDone: async function () { const d = await this.done(); return d.length > 0 && d.every(Boolean); },
    bilanVisible() { return p.evaluate(() => { const b = document.querySelector('.gw-mission-panel .gw-bilan'); return !!b && !b.hidden; }); },
    async step(i) { await p.click('.gw-step[data-i="' + i + '"]'); await p.waitForTimeout(600); },
    zoneRow(file) {
      return p.evaluate((f) => {
        const rows = [...document.querySelectorAll('.gw-zrow:not(.gw-zhead)')];
        const r = rows.find((x) => x.querySelector('.gw-zfile') && x.querySelector('.gw-zfile').textContent.startsWith(f));
        return r ? [...r.querySelectorAll('.gw-zcell')].map((c) => (c.querySelector('.gw-zsnip') || {}).textContent || '') : null;
      }, file);
    }
  });

  for (const lang of ['R', 'Python']) {
    const L = (s) => lang + ' :: ' + s;
    const ext = lang === 'R' ? 'R' : 'py';
    const assign = lang === 'R' ? '<- ' : '= ';
    const p = await page(1368, 900);
    const h = helpers(p);
    if (lang === 'Python') { await p.click('.gw-lang-btn[data-lang="Python"]'); await p.waitForTimeout(600); }
    check(L('langage choisi'), await p.evaluate(() => document.querySelector('#atelier').getAttribute('data-lang')) === lang);
    check(L('textes adaptés au langage'), (await p.textContent('.gw-mission-panel')).indexOf('.' + (lang === 'R' ? 'py' : 'R') + ' ') === -1);

    /* ---- prise en main ---- */
    await h.open('README.md');
    await h.cmd('git init');
    let o = await h.cmd('git status');
    check(L('prise en main : status avant add'), /No commits yet/.test(o) && /data\//.test(o));
    await h.cmd('git add README.md scripts/ rapport.qmd');
    o = await h.cmd('git commit -m "Initialise le suivi de l\'étude entreprises_defense"');
    check(L('prise en main : commit'), /root-commit/.test(o), o);
    await h.cmd('git log --oneline');
    check(L('prise en main : checklist complète'), await h.allDone(), JSON.stringify(await h.done()));
    check(L('prise en main : bilan affiché'), await h.bilanVisible());
    check(L('prise en main : étape marquée terminée'), await p.evaluate(() => document.querySelector('.gw-step[data-i="0"]').classList.contains('is-done')));

    /* ---- mission 1 : éditer, enregistrer, observer ---- */
    await p.click('.gw-mission-panel [data-next-mission]');
    await p.waitForTimeout(700);
    const f02 = 'scripts/02_nettoyage.' + ext;
    await h.open(f02);
    await h.type('seuil_dependance ' + assign + '0.20', 'seuil_dependance ' + assign + '0.10');
    check(L('M1 : éditeur marqué non enregistré'), /non enregistré/.test(await h.edState()));
    check(L('M1 : explorateur montre le point « non enregistré »'), await p.evaluate((f) => !!document.querySelector('.gw-node-file[data-file="' + f + '"] .gw-dirty-dot'), f02));
    o = await h.cmd('git status');
    check(L('M1 : Git ne voit rien tant que ce n\'est pas enregistré'), !/modified/.test(o), o);
    await p.focus('.gw-text');
    await h.save();
    check(L('M1 : enregistré'), /Enregistré/.test(await h.edState()));
    o = await h.cmd('git status');
    check(L('M1 : status voit le fichier après enregistrement'), new RegExp('modified:\\s+' + f02.replace('.', '\\.')).test(o), o);
    o = await h.cmd('git diff');
    check(L('M1 : diff -0.20 +0.10'), /-seuil_dependance.*0\.20/.test(o) && /\+seuil_dependance.*0\.10/.test(o), o);
    const z1 = await h.zoneRow('02_nettoyage');
    check(L('M1 : zones 0.10 | 0.20 | 0.20'), z1 && /0\.10/.test(z1[0]) && /0\.20/.test(z1[1]) && /0\.20/.test(z1[2]), JSON.stringify(z1));
    await p.click('.gw-q-btn[data-for="non"]');
    await p.waitForTimeout(300);
    check(L('M1 : checklist complète'), await h.allDone(), JSON.stringify(await h.done()));

    /* ---- mission 3 : le piège du add ---- */
    await h.step(3);
    await h.cmd('git add ' + f02);
    await h.open(f02);
    await h.type('0.10', '0.15');
    await h.save();
    o = await h.cmd('git status');
    check(L('M3 : le fichier est dans les deux listes'), /Changes to be committed[\s\S]*02_nettoyage[\s\S]*Changes not staged[\s\S]*02_nettoyage/.test(o), o);
    const z3 = await h.zoneRow('02_nettoyage');
    check(L('M3 : zones 0.15 | 0.10 | 0.20'), z3 && /0\.15/.test(z3[0]) && /0\.10/.test(z3[1]) && /0\.20/.test(z3[2]), JSON.stringify(z3));
    o = await h.cmd('git diff');
    check(L('M3 : diff = -0.10 +0.15'), /-seuil.*0\.10/.test(o) && /\+seuil.*0\.15/.test(o) && !/0\.20/.test(o.split('git diff').pop()), o);
    o = await h.cmd('git diff --staged');
    check(L('M3 : diff --staged = -0.20 +0.10'), /-seuil.*0\.20/.test(o.split('--staged').pop()) && /\+seuil.*0\.10/.test(o.split('--staged').pop()), o);
    if (SHOTS && lang === 'R') {
      await p.evaluate(() => document.querySelector('#atelier').scrollIntoView());
      await p.screenshot({ path: SHOTS + '/bac-1368-mission3.png', fullPage: false });
      await p.setViewportSize({ width: 1440, height: 900 });
      await p.waitForTimeout(300);
      await (await p.$('#atelier')).screenshot({ path: SHOTS + '/bac-1440-mission3.png' });
      await p.setViewportSize({ width: 1920, height: 1080 });
      await p.waitForTimeout(300);
      await (await p.$('#atelier')).screenshot({ path: SHOTS + '/bac-1920-mission3.png' });
      await p.setViewportSize({ width: 1368, height: 900 });
    }
    await h.cmd('git add ' + f02);
    check(L('M3 : checklist complète'), await h.allDone(), JSON.stringify(await h.done()));

    /* ---- mission 4 : restore, et l'éditeur suit ---- */
    await h.step(4);
    const f03 = 'scripts/03_analyse.' + ext;
    await h.open(f03);
    const original = await h.text();
    if (lang === 'R') await h.type('count(taille,', 'count(departement,');
    else await h.type('groupby("taille")', 'groupby("departement")');
    await h.save();
    await h.cmd('git status');
    o = await h.cmd('git diff');
    check(L('M4 : diff montre taille → departement'), /-.*taille/.test(o) && /\+.*departement/.test(o), o);
    await h.cmd('git restore ' + f03);
    check(L('M4 : après restore, l\'éditeur montre la version du commit'), (await h.text()) === original);
    o = await h.cmd('git status');
    check(L('M4 : status propre'), /nothing added to commit but untracked files present/.test(o), o);
    check(L('M4 : checklist complète'), await h.allDone(), JSON.stringify(await h.done()));

    /* ---- I. Annuler et Recommencer ---- */
    await p.click('.gw-undo');             // annule le restore
    await p.waitForTimeout(400);
    check(L('Annuler : le fichier modifié revient dans l\'éditeur'), /departement/.test(await h.text()));
    o = await h.cmd('git status');
    check(L('Annuler : Git revoit la modification'), /modified:\s+scripts\/03_analyse/.test(o), o);
    // git status ne change rien : il n'est pas dans la pile d'annulation.
    // Le clic suivant annule donc l'enregistrement lui-même.
    await p.click('.gw-undo');
    await p.waitForTimeout(400);
    const st = await p.evaluate(() => window.GitSandboxWorkbench.instances[0].state());
    const disk = await p.evaluate((f) => window.GitSandboxWorkbench.instances[0].sandbox.readFile(f), f03);
    check(L('Annuler l\'enregistrement : le disque reprend l\'ancien contenu'), disk === original, disk);
    check(L('Annuler l\'enregistrement : la modification reste dans l\'éditeur, non enregistrée'),
      /departement/.test(await h.text()) && /non enregistré/.test(await h.edState()), JSON.stringify(st.buffers[f03]));
    check(L('Annuler : plus rien à annuler, bouton désactivé'), await p.evaluate(() => document.querySelector('.gw-undo').disabled));
    await p.click('.gw-restart');
    await p.waitForTimeout(700);
    check(L('Recommencer : checklist remise à zéro'), (await h.done()).every((d) => !d));
    check(L('Recommencer : éditeur sur la version de départ'), (await h.text()) === original);
    check(L('Recommencer : terminal vidé'), (await p.textContent('.gw-out')).indexOf('git restore') === -1);

    /* ---- mission 2 et défi, plus vite ---- */
    await h.step(2);
    await h.open('rapport.qmd');
    await h.type('moins 20 %.', 'moins 10 %.');
    await h.save();
    await h.cmd('git status');
    await h.cmd('git diff');
    await h.cmd('git add ' + f02 + ' rapport.qmd');
    await h.cmd('git diff --staged');
    await h.cmd('git commit -m "Abaisse le seuil de dépendance défense à 10 %"');
    await h.cmd('git log --oneline');
    check(L('M2 : checklist complète'), await h.allDone(), JSON.stringify(await h.done()));

    await h.step(5);
    check(L('Défi : solution cachée au départ'), await p.evaluate(() => document.querySelector('.gw-mission-panel .gw-solution').hidden));
    await p.click('.gw-mission-panel .gw-hint-btn');
    check(L('Défi : indice 1 révélé, pas la solution'), await p.evaluate(() => !document.querySelector('.gw-mission-panel .gw-hint').hidden && document.querySelector('.gw-mission-panel .gw-solution').hidden));
    await h.open(f03);
    if (lang === 'R') await h.type('count(taille,', 'count(taille, departement,');
    else await h.type('groupby("taille")', 'groupby(["taille", "departement"])');
    await h.save();
    await h.open('rapport.qmd');
    await h.type('par taille est la suivante', 'par taille et par département est la suivante');
    await h.save();
    await h.cmd('git status');
    await h.cmd('git diff');
    await h.cmd('git add ' + f03 + ' rapport.qmd');
    await h.cmd('git diff --staged');
    await h.cmd('git commit -m "Ventile les résultats par taille et par département"');
    await h.cmd('git log --oneline');
    check(L('Défi : checklist complète'), await h.allDone(), JSON.stringify(await h.done()));

    /* ---- sauvegarde de progression ---- */
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('atelier1-bac-a-sable:v1') || '{}'));
    check(L('progression retenue (langage, missions terminées)'), saved.lang === lang && saved.done && saved.done['mission-2'] && saved.done.defi, JSON.stringify(saved));
    await p.close();
  }

  /* ---- mobile : onglets ---- */
  {
    const p = await page(390, 844);
    const h = helpers(p);
    const visible = (sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
    check('mobile : onglets visibles', await visible('.gw-mtabs'));
    check('mobile : éditeur affiché, terminal masqué', (await visible('.gw-editor')) && !(await visible('.gw-terminal')));
    await p.click('.gw-mtabs [data-mtab="files"]');
    check('mobile : onglet Fichiers', await visible('.gw-explorer'));
    await h.open('README.md');
    check('mobile : ouvrir un fichier bascule sur l\'éditeur', await visible('.gw-editor'));
    await p.click('.gw-mtabs [data-mtab="terminal"]');
    await h.cmd('git init');
    await p.click('.gw-mtabs [data-mtab="zones"]');
    check('mobile : onglet Git', await visible('.gw-zones'));
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('mobile : pas de défilement horizontal', overflow <= 1, overflow);
    if (SHOTS) {
      await p.click('.gw-mtabs [data-mtab="editor"]');
      await (await p.$('#atelier')).screenshot({ path: SHOTS + '/bac-390-editeur.png' });
      await p.click('.gw-mtabs [data-mtab="zones"]');
      await (await p.$('#atelier')).screenshot({ path: SHOTS + '/bac-390-zones.png' });
    }
    await p.close();
  }

  await browser.close();
  console.log('\n===== bac à sable, de bout en bout =====');
  console.log('passed: ' + pass + '   failed: ' + fail);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }
})();
