/* Fidélité au vrai Git : on rejoue les mêmes gestes dans le bac à sable et
   avec le vrai `git`, sur les mêmes fichiers, et on compare les sorties
   (les empreintes de commit, qui dépendent des dates, sont neutralisées).
   Run: node tests/test-fidelite.js      (ignoré si git est absent) */
const git = require('isomorphic-git');
const Core = require('../src/sandbox-core.js');
const Bac = require('../../assets/js/bac-a-sable.js');
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');

const strip = (s) => String(s).replace(/\{[grybw\/]\}/g, '');
const norm = (s) => s.replace(/\n+$/, '').replace(/\b[0-9a-f]{7}\b/g, 'SHA').replace(/repository in \S+\/\.git\//, 'repository in DOSSIER/.git/');

try { execSync('git --version', { stdio: 'ignore' }); }
catch (e) { console.log('\n===== fidélité =====\ngit absent : suite ignorée'); process.exit(0); }

let pass = 0, fail = 0;
const failures = [];

async function scenario(name, lang, seedFiles, setup, steps) {
  const sb = Core.createSandbox({ git });
  await sb.reset(async (s) => { for (const [p, c] of Object.entries(seedFiles)) await s.writeFile(p, c); });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fid-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fid-home-'));
  const env = { ...process.env, HOME: home, GIT_CONFIG_NOSYSTEM: '1', LANG: 'C', LC_ALL: 'C',
    GIT_AUTHOR_NAME: 'Vous', GIT_AUTHOR_EMAIL: 'vous@exemple.fr', GIT_COMMITTER_NAME: 'Vous', GIT_COMMITTER_EMAIL: 'vous@exemple.fr' };
  const sh = (c) => { try { return execSync(c + ' 2>&1', { cwd: dir, env, encoding: 'utf8' }); } catch (e) { return String(e.stdout || ''); } };
  for (const [p, c] of Object.entries(seedFiles)) { fs.mkdirSync(path.join(dir, path.dirname(p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); }
  sh('git config --global init.defaultBranch main');
  for (const c of setup) { await sb.run(c); sh(c); }
  for (const st of steps) {
    if (typeof st !== 'string') {
      const t = st.fn(await sb.readFile(st.file));
      await sb.writeFile(st.file, t); fs.writeFileSync(path.join(dir, st.file), t);
      continue;
    }
    const mine = norm(strip((await sb.run(st)).out));
    const real = norm(sh(st));
    if (mine === real) pass++;
    else { fail++; failures.push(`${name} (${lang}) :: ${st}\n[bac]\n${mine}\n[git]\n${real}`); }
  }
}

(async () => {
  for (const lang of ['R', 'Python']) {
    const p = Bac.fileFor(lang, '02_nettoyage');
    const edit = (file, fn) => ({ file, fn });
    await scenario('prise en main', lang, Bac.fichiers(lang), [], [
      'git init', 'git status', 'git add README.md scripts/ rapport.qmd', 'git status',
      "git commit -m \"Initialise le suivi de l'étude entreprises_defense\"", 'git status'
    ]);
    await scenario('trois zones', lang, Bac.fichiers(lang, { gitignore: true }),
      ['git init', 'git add README.md scripts/ rapport.qmd', 'git commit -m "Initialise"', 'git add .gitignore', 'git commit -m "Ignore"'], [
        'git status',
        edit(p, Bac.EDITS.seuil(lang, '0.10')), 'git status', 'git diff', 'git add ' + p, 'git status', 'git diff', 'git diff --staged',
        edit(p, Bac.EDITS.seuil(lang, '0.15')), 'git status', 'git diff', 'git diff --staged',
        edit('rapport.qmd', Bac.EDITS.rapport10), 'git status', 'git diff rapport.qmd',
        'git restore --staged ' + p, 'git status', 'git restore ' + p, 'git diff',
        'git add rapport.qmd', 'git commit -m "Abaisse le seuil"', 'git status', 'git commit -m "vide"',
        edit(Bac.fileFor(lang, '03_analyse'), Bac.EDITS.accident(lang)), 'git diff',
        'git restore ' + Bac.fileFor(lang, '03_analyse'), 'git status'
      ]);
  }
  console.log('\n===== fidélité au vrai Git =====');
  console.log('passed: ' + pass + '   failed: ' + fail);
  if (failures.length) { console.log('\nFAILURES:'); failures.forEach((f) => console.log(' - ' + f)); process.exitCode = 1; }
})();
