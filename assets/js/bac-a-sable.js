/* =====================================================================
   bac-a-sable.js — le projet et les missions du bac à sable de l'atelier 1.

   Le projet entreprises_defense est celui du kit Onyxia (kit/kit.sh) :
   mêmes fichiers, mêmes scripts, même seuil de 20 %, mêmes messages de
   commit. Seuls .gitignore et sorties/synthese.csv sont propres au bac.

   Le moteur (Git, éditeur, terminal) est dans l'extension git-sandbox.
   Ce fichier ne fait que décrire :
     - les fichiers du projet, en R et en Python ;
     - l'état de départ de chaque mission ;
     - les contrôles qui cochent la checklist de chaque mission.
   Les textes des missions sont dans bac-a-sable.qmd.

   Utilisé aussi par les tests (sandbox/tests/test-atelier.js).
   ===================================================================== */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------
     Les fichiers du kit (copie conforme de ce que produit kit/kit.sh)
     ------------------------------------------------------------------ */
  var KIT = {
    common: {
      README_R: `# Entreprises liées à la défense — étude 2024

Étude interne sur les entreprises dont l'activité dépend de la défense.
Toutes les données sont synthétiques : aucune entreprise réelle,
SIREN fictifs commençant par 000.

## Objectif

Repérer les entreprises dont une part importante du chiffre d'affaires
provient de la défense, et décrire leur répartition par taille.

## Champ

Extrait entreprises_defense_2024 : 40 lignes d'entreprises fictives.
Sont retenues les entreprises dont la part du chiffre d'affaires
réalisée dans la défense atteint le seuil de dépendance (20 %).

## Arborescence

    data/entreprises_defense_2024.csv   extrait synthétique
    scripts/01_import.R               lecture du fichier
    scripts/02_nettoyage.R            part de CA défense, taille, filtre
    scripts/03_analyse.R              effectifs par taille, graphique
    rapport.qmd                         rapport Quarto

## Comment lancer

    Rscript scripts/03_analyse.R    # produit figures/effectifs_par_taille.png
    quarto render rapport.qmd

Packages R : readr, dplyr, ggplot2.
`,
      README_Python: `# Entreprises liées à la défense — étude 2024

Étude interne sur les entreprises dont l'activité dépend de la défense.
Toutes les données sont synthétiques : aucune entreprise réelle,
SIREN fictifs commençant par 000.

## Objectif

Repérer les entreprises dont une part importante du chiffre d'affaires
provient de la défense, et décrire leur répartition par taille.

## Champ

Extrait entreprises_defense_2024 : 40 lignes d'entreprises fictives.
Sont retenues les entreprises dont la part du chiffre d'affaires
réalisée dans la défense atteint le seuil de dépendance (20 %).

## Arborescence

    data/entreprises_defense_2024.csv   extrait synthétique
    scripts/01_import.py               lecture du fichier
    scripts/02_nettoyage.py            part de CA défense, taille, filtre
    scripts/03_analyse.py              effectifs par taille, graphique
    rapport.qmd                         rapport Quarto

## Comment lancer

    python scripts/03_analyse.py    # produit figures/effectifs_par_taille.png
    quarto render rapport.qmd

Paquets Python : pandas, matplotlib.
`,
      CSV: `siren,raison_sociale,naf,departement,effectifs,ca_total_keur,ca_defense_keur
000123457,Mécanique de Précision du Bourbonnais,25.62B,03,85,9800,4100
000218734,Optronique de l'Estuaire,26.70Z,44,310,62000,38400
000304561,Ateliers Navals de la Rade Nord,30.11Z,83,2400,510000,367000
000411298,Forges et Blindages du Val d'Allier,25.40Z,03,640,118000,94400
000527613,Électronique Embarquée des Causses,26.51B,12,180,27500,6050
000639042,Aérostructures du Lauragais,30.30Z,31,5400,1350000,405000
000742285,Pyrotechnie de la Vallée Blanche,20.51Z,18,95,21000,19950
000856107,Maintenance Aéronautique des Landes Sud,33.16Z,40,420,78000,46800
000963370,Systèmes Radar du Plateau,26.51B,91,1250,310000,229400
000105842,Chaudronnerie Fine du Morvan,25.62B,58,45,6100,305
000117396,Textiles Techniques de la Lys,13.96Z,59,130,19800,2970
000129654,Câblages Spéciaux de Touraine,27.32Z,37,260,38000,13300
000131907,Ingénierie des Systèmes Côtiers,71.12B,29,75,11200,7280
000142278,Usinage Aéro du Béarn,25.62B,64,210,33500,5025
000153516,Véhicules Tactiques du Centre,30.40Z,18,1850,640000,544000
000164839,Fonderie Légère de la Vienne,24.53Z,86,330,52000,3120
000176152,Logiciels de Commandement Atlantique,62.01Z,35,160,24000,12000
000188405,Composants Hyperfréquence du Grésivaudan,26.11Z,38,540,98000,29400
000190763,Revêtements Techniques de l'Ain,25.61Z,01,88,9400,470
000202891,Munitions de Moyen Calibre du Cher,25.40Z,18,720,195000,181350
000214537,Plasturgie de Précision du Jura,22.29A,39,150,21000,420
000226984,Machines Spéciales de la Loire,28.99B,42,390,61000,12200
000238125,Transmissions Tactiques de Bretagne,26.30Z,22,480,87000,60900
000963370,Systèmes Radar du Plateau,26.51B,91,1250,310000,229400
000240679,Recherche Appliquée en Détection,72.19Z,13,55,7800,5460
000252346,Installations Industrielles de Seine-Aval,33.20B,76,610,94000,14100
000264810,Moteurs Aéronautiques du Sud-Ouest,30.30Z,33,12000,4200000,1470000
000276473,Optique de Vision Nocturne,26.70Z,25,240,41000,32800
000288537,Mécatronique de l'Oise,28.99B,60,115,16500,2475
000290214,Simulateurs et Entraînement du Var,26.51B,83,290,52000,39000
000302768,Chantier de Réparation Navale du Ponant,33.15Z,29,870,145000,101500
000314092,Propulsion Spatiale de Guyenne,30.30Z,33,3100,820000,205000
000326451,Équipements de Protection des Vosges,32.99Z,88,65,8800,4840
000338706,Ressorts et Pièces Forgées du Doubs,25.50B,25,140,17200,1720
000340159,Drones et Capteurs de Provence,30.30Z,13,36,5400,3780
000352683,Électronique de Puissance Normande,27.11Z,14,950,176000,21120
000364927,Blindés Légers du Poitou,30.40Z,86,1450,380000,285000
000376281,Conseil en Sûreté Industrielle,70.22Z,75,12,1900,760
000388549,Traitements Thermiques de Picardie,25.61Z,80,72,7600,1140
000202891,Munitions de Moyen Calibre du Cher,25.40Z,18,720,195000,181350
`
    },
    R: {
      '01': `# Import de l'extrait entreprises_defense_2024
library(readr)
library(dplyr)

entreprises_brut <- read_csv(
  "data/entreprises_defense_2024.csv",
  col_types = cols(siren = col_character(), departement = col_character())
)
`,
      '02': `# Nettoyage : ne garder que les entreprises dépendantes de la défense
source("scripts/01_import.R")

seuil_dependance <- 0.20

entreprises <- entreprises_brut |>
  # Un même SIREN ne doit compter qu'une fois
  distinct(siren, .keep_all = TRUE) |>
  mutate(
    part_ca_defense = ca_defense_keur / ca_total_keur,
    taille = case_when(
      effectifs < 250 ~ "PME",
      effectifs < 5000 ~ "ETI",
      TRUE ~ "GE"
    )
  ) |>
  filter(part_ca_defense >= seuil_dependance)
`,
      '03': `# Analyse : les entreprises liées à la défense, par taille
source("scripts/02_nettoyage.R")
library(ggplot2)

effectifs_taille <- entreprises |>
  count(taille, name = "effectifs") |>
  mutate(part = effectifs / sum(effectifs))

graphique <- ggplot(effectifs_taille, aes(x = taille, y = part)) +
  geom_col(fill = "#0f766e") +
  scale_y_continuous(labels = scales::percent) +
  labs(
    title = "Entreprises liées à la défense, par taille",
    x = NULL,
    y = "Part des entreprises"
  )

dir.create("figures", showWarnings = FALSE)
ggsave("figures/effectifs_par_taille.png", graphique, width = 7, height = 4)
`,
      'rapport': `---
title: "Les entreprises liées à la défense en 2024"
subtitle: "Étude entreprises_defense — document de travail"
author: "Marie"
lang: fr
format: html
---

\`\`\`{r}
#| include: false
source("scripts/03_analyse.R")
\`\`\`

## Champ

Entreprises de l'extrait entreprises_defense_2024 (données synthétiques)
dont la part du chiffre d'affaires réalisée dans la défense atteint au
moins 20 %.

## Méthode

La part de CA défense rapporte le chiffre d'affaires réalisé dans la
défense au chiffre d'affaires total. Les entreprises sont classées par
taille : PME (moins de 250 salariés), ETI (moins de 5 000), GE (au-delà).

## Résultats

En 2024, \`r nrow(entreprises)\` entreprises de l'extrait atteignent le seuil
de dépendance. Leur répartition par taille est la suivante.

\`\`\`{r}
#| echo: false
knitr::kable(effectifs_taille, col.names = c("Taille", "Nombre", "Part"), digits = 2)
\`\`\`

\`\`\`{r}
#| echo: false
graphique
\`\`\`
`,
      'brouillon': `# brouillon — essais rapides, à ne pas garder
x <- read.csv("data/entreprises_defense_2024.csv")
head(x)
summary(x$effectifs)
table(x$naf)
plot(x$effectifs, x$ca_defense_keur)
`
    },
    Python: {
      '01': `# Import de l'extrait entreprises_defense_2024
import pandas as pd

entreprises_brut = pd.read_csv(
    "data/entreprises_defense_2024.csv",
    dtype={"siren": str, "departement": str},
)
`,
      '02': `# Nettoyage : ne garder que les entreprises dépendantes de la défense
exec(open("scripts/01_import.py", encoding="utf-8").read())

seuil_dependance = 0.20


def classe_taille(effectifs):
    if effectifs < 250:
        return "PME"
    if effectifs < 5000:
        return "ETI"
    return "GE"


# Un même SIREN ne doit compter qu'une fois
entreprises = entreprises_brut.drop_duplicates(subset="siren").copy()
entreprises["part_ca_defense"] = entreprises["ca_defense_keur"] / entreprises["ca_total_keur"]
entreprises["taille"] = entreprises["effectifs"].apply(classe_taille)
entreprises = entreprises[entreprises["part_ca_defense"] >= seuil_dependance]
`,
      '03': `# Analyse : les entreprises liées à la défense, par taille
exec(open("scripts/02_nettoyage.py", encoding="utf-8").read())
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.ticker import PercentFormatter

effectifs_taille = (
    entreprises.groupby("taille").size().rename("effectifs").reset_index()
)
effectifs_taille["part"] = effectifs_taille["effectifs"] / effectifs_taille["effectifs"].sum()

fig, ax = plt.subplots(figsize=(7, 4))
ax.bar(effectifs_taille["taille"], effectifs_taille["part"], color="#0f766e")
ax.yaxis.set_major_formatter(PercentFormatter(1))
ax.set_title("Entreprises liées à la défense, par taille")
ax.set_ylabel("Part des entreprises")

os.makedirs("figures", exist_ok=True)
fig.savefig("figures/effectifs_par_taille.png", dpi=150)
`,
      'rapport': `---
title: "Les entreprises liées à la défense en 2024"
subtitle: "Étude entreprises_defense — document de travail"
author: "Marie"
lang: fr
format: html
---

\`\`\`{python}
#| include: false
exec(open("scripts/03_analyse.py", encoding="utf-8").read())
\`\`\`

## Champ

Entreprises de l'extrait entreprises_defense_2024 (données synthétiques)
dont la part du chiffre d'affaires réalisée dans la défense atteint au
moins 20 %.

## Méthode

La part de CA défense rapporte le chiffre d'affaires réalisé dans la
défense au chiffre d'affaires total. Les entreprises sont classées par
taille : PME (moins de 250 salariés), ETI (moins de 5 000), GE (au-delà).

## Résultats

En 2024, \`{python} len(entreprises)\` entreprises de l'extrait atteignent le
seuil de dépendance. Leur répartition par taille est la suivante.

\`\`\`{python}
#| echo: false
effectifs_taille
\`\`\`

\`\`\`{python}
#| echo: false
fig
\`\`\`
`,
      'brouillon': `# brouillon — essais rapides, à ne pas garder
import pandas as pd

x = pd.read_csv("data/entreprises_defense_2024.csv")
print(x.head())
print(x["effectifs"].describe())
print(x["naf"].value_counts())
`
    }
  };

  /* ------------------------------------------------------------------
     Les fichiers propres au bac à sable (ils n'existent pas dans le kit)
     ------------------------------------------------------------------ */

  // .gitignore : celui du Temps 4 de l'atelier, plus sorties/ et __pycache__/
  var GITIGNORE = [
    'data/',
    '*.html',
    '.Rhistory',
    '.Renviron',
    'figures/',
    'sorties/',
    '__pycache__/',
    ''
  ].join('\n');

  // sorties/synthese.csv : ce que produit réellement 03_analyse sur l'extrait
  // (27 entreprises retenues au seuil de 20 % : 15 ETI, 2 GE, 10 PME)
  var SYNTHESE = [
    'taille,effectifs,part',
    'ETI,15,0.56',
    'GE,2,0.07',
    'PME,10,0.37',
    ''
  ].join('\n');

  var EXT = { R: 'R', Python: 'py' };

  function fileFor(lang, name) {
    var ext = EXT[lang] || 'R';
    if (name === 'brouillon_test') return 'brouillon_test.' + ext;
    if (/^0\d_/.test(name)) return 'scripts/' + name + '.' + ext;
    return name;
  }

  // Tous les fichiers du projet, pour un langage
  function fichiers(lang, options) {
    options = options || {};
    var L = KIT[lang] || KIT.R;
    var f = {};
    f['README.md'] = KIT.common['README_' + lang] || KIT.common.README_R;
    f['data/entreprises_defense_2024.csv'] = KIT.common.CSV;
    f[fileFor(lang, '01_import')] = L['01'];
    f[fileFor(lang, '02_nettoyage')] = L['02'];
    f[fileFor(lang, '03_analyse')] = L['03'];
    f['rapport.qmd'] = L.rapport;
    f[fileFor(lang, 'brouillon_test')] = L.brouillon;
    if (options.gitignore) {
      f['.gitignore'] = GITIGNORE;
      f['sorties/synthese.csv'] = SYNTHESE;
    }
    return f;
  }

  /* --------------------------- modifications ---------------------------- */

  // Les modifications que les missions demandent, écrites une fois pour
  // les deux langages (et pour les tests)
  var EDITS = {
    seuil: function (lang, valeur) {
      return function (txt) {
        return txt.replace(/seuil_dependance (<-|=) 0\.\d+/, 'seuil_dependance $1 ' + valeur);
      };
    },
    rapport10: function (txt) { return txt.replace('moins 20 %.', 'moins 10 %.'); },
    accident: function (lang) {
      return function (txt) {
        return lang === 'Python'
          ? txt.replace('groupby("taille")', 'groupby("departement")')
          : txt.replace('count(taille, name', 'count(departement, name');
      };
    },
    defiScript: function (lang) {
      return function (txt) {
        return lang === 'Python'
          ? txt.replace('groupby("taille")', 'groupby(["taille", "departement"])')
          : txt.replace('count(taille, name', 'count(taille, departement, name');
      };
    },
    defiRapport: function (txt) {
      return txt.replace('Leur répartition par taille est la suivante.',
        'Leur répartition par taille et par département est la suivante.');
    }
  };

  /* ------------------------ états de départ ----------------------------- */

  async function ecrire(sb, files) {
    var paths = Object.keys(files);
    for (var i = 0; i < paths.length; i++) await sb.writeFile(paths[i], files[paths[i]]);
  }

  async function lancer(sb, line) {
    var r = await sb.run(line);
    if (!r.ok) throw new Error(line + ' — ' + String(r.out).split('\n')[0]);
  }

  // Le projet tel qu'il est à la fin de l'atelier (Temps 2 et Temps 4) :
  // deux commits, les données et les sorties ignorées, le brouillon hors
  // du dépôt.
  async function projetSuivi(sb, lang) {
    await ecrire(sb, fichiers(lang, { gitignore: true }));
    await lancer(sb, 'git init');
    await lancer(sb, 'git config user.name "Vous"');
    await lancer(sb, 'git config user.email "vous@exemple.fr"');
    await lancer(sb, 'git add README.md scripts/ rapport.qmd');
    await lancer(sb, 'git commit -m "Initialise le suivi de l\'étude entreprises_defense" --date 2026-10-06T14:20:00+02:00');
    await lancer(sb, 'git add .gitignore');
    await lancer(sb, 'git commit -m "Ignore les données, les sorties et les fichiers d\'environnement" --date 2026-10-06T15:02:00+02:00');
  }

  async function modifier(sb, path, fn) {
    await sb.writeFile(path, fn(await sb.readFile(path)));
  }

  /* ------------------------------ contrôles ------------------------------ */

  function derniere(ctx, re) {
    var e = ctx.last;
    return !!(e && e.type === 'cmd' && e.ok && re.test(e.line));
  }
  var RE = {
    status: /^git\s+status\b/,
    diff: /^git\s+diff(?!.*--(staged|cached))(\s|$)/,
    staged: /^git\s+diff\b.*--(staged|cached)\b/,
    log: /^git\s+log\b/,
    restore: /^git\s+restore\b(?!.*--staged)/,
    init: /^git\s+init\b/
  };
  function contient(txt, re) { return txt !== null && txt !== undefined && re.test(txt); }
  function a(lang, valeur) {
    return new RegExp('seuil_dependance (<-|=) ' + valeur.replace('.', '\\.') + '\\b');
  }
  function listed(list, p) {
    return list.some(function (x) { return (x.file || x) === p; });
  }
  var MESSAGE_VIDE = /^(modif(ication)?s?|update|maj|v\d+|wip|test|commit|ok|\.+)$/i;

  var missions = {

    'prise-en-main': {
      open: function () { return 'README.md'; },
      seed: function (sb, lang) { return ecrire(sb, fichiers(lang)); },
      intro: function () {
        return ['Le dossier de l\'étude est là, mais Git ne le suit pas encore.',
          'Ouvrez README.md, puis tapez git init.'];
      },
      checks: {
        'pm-open': function (ctx) { return ctx.opened('README.md'); },
        'pm-init': function (ctx) { return ctx.model.isRepo; },
        'pm-status': function (ctx) { return ctx.model.isRepo && derniere(ctx, RE.status); },
        'pm-add': async function (ctx) {
          return (await ctx.index('README.md')) !== null &&
            (await ctx.index('rapport.qmd')) !== null &&
            (await ctx.index(ctx.f('02_nettoyage'))) !== null &&
            (await ctx.index(ctx.f('brouillon_test'))) === null &&
            (await ctx.index('data/entreprises_defense_2024.csv')) === null;
        },
        'pm-commit': async function (ctx) {
          return ctx.newCommits().length >= 1 &&
            (await ctx.head('README.md')) !== null &&
            (await ctx.head(ctx.f('03_analyse'))) !== null &&
            (await ctx.head(ctx.f('brouillon_test'))) === null;
        },
        'pm-log': function (ctx) { return ctx.newCommits().length >= 1 && derniere(ctx, RE.log); }
      }
    },

    'mission-1': {
      open: function (lang) { return fileFor(lang, '02_nettoyage'); },
      seed: function (sb, lang) { return projetSuivi(sb, lang); },
      intro: function () {
        return ['Projet entreprises_defense : 2 commits, rien en attente.'];
      },
      checks: {
        'm1-open': function (ctx) { return ctx.opened(ctx.f('02_nettoyage')); },
        'm1-edit': async function (ctx) {
          return contient(await ctx.work(ctx.f('02_nettoyage')), a(ctx.lang, '0.10'));
        },
        'm1-status': function (ctx) {
          return derniere(ctx, RE.status) && listed(ctx.status.modified, ctx.f('02_nettoyage'));
        },
        'm1-diff': function (ctx) {
          return derniere(ctx, RE.diff) && listed(ctx.status.modified, ctx.f('02_nettoyage'));
        },
        'm1-question': function (ctx) { return ctx.answer('m1') === 'non'; }
      }
    },

    'mission-2': {
      open: function () { return 'rapport.qmd'; },
      seed: async function (sb, lang) {
        await projetSuivi(sb, lang);
        await modifier(sb, fileFor(lang, '02_nettoyage'), EDITS.seuil(lang, '0.10'));
      },
      intro: function (lang) {
        return ['Reprise de la mission 1 : ' + fileFor(lang, '02_nettoyage') + ' est modifié (seuil 0.10), rien n\'est sélectionné.'];
      },
      checks: {
        'm2-rapport': async function (ctx) {
          return contient(await ctx.work('rapport.qmd'), /moins\s+10\s*%/);
        },
        'm2-observe': function (ctx) {
          return (derniere(ctx, RE.status) || derniere(ctx, RE.diff)) &&
            listed(ctx.status.modified, 'rapport.qmd') &&
            (listed(ctx.status.modified, ctx.f('02_nettoyage')) || listed(ctx.status.staged, ctx.f('02_nettoyage')));
        },
        'm2-add': async function (ctx) {
          return contient(await ctx.index(ctx.f('02_nettoyage')), a(ctx.lang, '0.10')) &&
            contient(await ctx.index('rapport.qmd'), /moins\s+10\s*%/) &&
            (await ctx.index(ctx.f('brouillon_test'))) === null;
        },
        'm2-staged': function (ctx) {
          return derniere(ctx, RE.staged) &&
            listed(ctx.status.staged, ctx.f('02_nettoyage')) && listed(ctx.status.staged, 'rapport.qmd');
        },
        'm2-commit': async function (ctx) {
          return ctx.newCommits().length >= 1 &&
            contient(await ctx.head(ctx.f('02_nettoyage')), a(ctx.lang, '0.10')) &&
            contient(await ctx.head('rapport.qmd'), /moins\s+10\s*%/) &&
            (await ctx.head(ctx.f('brouillon_test'))) === null;
        },
        'm2-message': function (ctx) {
          var c = ctx.newCommits()[0];
          return !!c && c.message.trim().length >= 12 && !MESSAGE_VIDE.test(c.message.trim());
        },
        'm2-log': function (ctx) { return ctx.newCommits().length >= 1 && derniere(ctx, RE.log); }
      }
    },

    'mission-3': {
      open: function (lang) { return fileFor(lang, '02_nettoyage'); },
      seed: async function (sb, lang) {
        await projetSuivi(sb, lang);
        await modifier(sb, fileFor(lang, '02_nettoyage'), EDITS.seuil(lang, '0.10'));
      },
      intro: function (lang) {
        return [fileFor(lang, '02_nettoyage') + ' est enregistré avec le seuil 0.10, pas encore sélectionné.'];
      },
      checks: {
        'm3-add': async function (ctx) {
          return contient(await ctx.index(ctx.f('02_nettoyage')), a(ctx.lang, '0.10'));
        },
        'm3-edit': async function (ctx) {
          return contient(await ctx.work(ctx.f('02_nettoyage')), a(ctx.lang, '0.15')) &&
            contient(await ctx.index(ctx.f('02_nettoyage')), a(ctx.lang, '0.10'));
        },
        'm3-status': function (ctx) {
          var p = ctx.f('02_nettoyage');
          return derniere(ctx, RE.status) && listed(ctx.status.staged, p) && listed(ctx.status.modified, p);
        },
        'm3-diff': async function (ctx) {
          var p = ctx.f('02_nettoyage');
          return derniere(ctx, RE.diff) && listed(ctx.status.modified, p) &&
            contient(await ctx.index(p), a(ctx.lang, '0.10'));
        },
        'm3-staged': async function (ctx) {
          var p = ctx.f('02_nettoyage');
          return derniere(ctx, RE.staged) && listed(ctx.status.staged, p) &&
            contient(await ctx.index(p), a(ctx.lang, '0.10'));
        },
        'm3-decide': async function (ctx) {
          var p = ctx.f('02_nettoyage');
          var w = await ctx.work(p), i = await ctx.index(p);
          return ctx.events.some(function (e) { return e.type === 'cmd' && RE.staged.test(e.line); }) &&
            w !== null && w === i && (contient(w, a(ctx.lang, '0.15')) || contient(w, a(ctx.lang, '0.10')));
        }
      }
    },

    'mission-4': {
      open: function (lang) { return fileFor(lang, '03_analyse'); },
      seed: async function (sb, lang) {
        await projetSuivi(sb, lang);
        await modifier(sb, fileFor(lang, '02_nettoyage'), EDITS.seuil(lang, '0.10'));
        await modifier(sb, 'rapport.qmd', EDITS.rapport10);
        await lancer(sb, 'git add ' + fileFor(lang, '02_nettoyage') + ' rapport.qmd');
        await lancer(sb, 'git commit -m "Abaisse le seuil de dépendance défense à 10 %" --date 2026-10-09T10:15:00+02:00');
      },
      intro: function () {
        return ['Vendredi, tout était commité : 3 commits, rien en attente.'];
      },
      checks: {
        'm4-open': function (ctx) { return ctx.opened(ctx.f('03_analyse')); },
        'm4-accident': async function (ctx) {
          var w = await ctx.work(ctx.f('03_analyse'));
          return w !== null && w !== (await ctx.head(ctx.f('03_analyse')));
        },
        'm4-status': function (ctx) {
          return derniere(ctx, RE.status) && listed(ctx.status.modified, ctx.f('03_analyse'));
        },
        'm4-diff': function (ctx) {
          return derniere(ctx, RE.diff) && listed(ctx.status.modified, ctx.f('03_analyse'));
        },
        'm4-restore': async function (ctx) {
          var p = ctx.f('03_analyse');
          return derniere(ctx, RE.restore) && (await ctx.work(p)) === (await ctx.head(p));
        },
        'm4-clean': function (ctx) {
          return derniere(ctx, RE.status) && !ctx.status.modified.length && !ctx.status.staged.length;
        }
      }
    },

    'defi': {
      open: function () { return null; },
      seed: function (sb, lang) { return missions['mission-4'].seed(sb, lang); },
      intro: function () {
        return ['À vous de jouer. Tapez help pour la liste des commandes.'];
      },
      checks: {
        'd-script': async function (ctx) {
          var p = ctx.f('03_analyse');
          var w = await ctx.work(p);
          return contient(w, /departement/) && w !== (await ctx.readAt(ctx.startOid, p));
        },
        'd-rapport': async function (ctx) {
          var w = await ctx.work('rapport.qmd');
          return contient(w, /départements?/i) && w !== (await ctx.readAt(ctx.startOid, 'rapport.qmd'));
        },
        'd-observe': function (ctx) {
          return (derniere(ctx, RE.status) || derniere(ctx, RE.diff)) &&
            listed(ctx.status.modified, ctx.f('03_analyse')) && listed(ctx.status.modified, 'rapport.qmd');
        },
        'd-staged': function (ctx) {
          return derniere(ctx, RE.staged) &&
            listed(ctx.status.staged, ctx.f('03_analyse')) && listed(ctx.status.staged, 'rapport.qmd');
        },
        'd-commit': async function (ctx) {
          var p = ctx.f('03_analyse');
          var news = ctx.newCommits();
          for (var i = 0; i < news.length; i++) {
            var c = news[i];
            var parent = (c.parents || [])[0];
            var s1 = await ctx.readAt(c.oid, p), s0 = await ctx.readAt(parent, p);
            var r1 = await ctx.readAt(c.oid, 'rapport.qmd'), r0 = await ctx.readAt(parent, 'rapport.qmd');
            var brouillon = await ctx.readAt(c.oid, ctx.f('brouillon_test'));
            if (s1 !== s0 && r1 !== r0 && contient(s1, /departement/) && brouillon === null &&
                c.message.trim().length >= 12 && !MESSAGE_VIDE.test(c.message.trim())) return true;
          }
          return false;
        },
        'd-log': function (ctx) { return ctx.newCommits().length >= 1 && derniere(ctx, RE.log); }
      }
    }
  };

  // Adapter les textes des missions au langage choisi
  function swapLang(text, lang) {
    var ext = EXT[lang] || 'R';
    return text
      .replace(/\b(0[1-3]_[a-z_]+|brouillon_test)\.(R|py)\b/g, '$1.' + ext)
      .replace(/seuil_dependance (<-|=) /g, lang === 'Python' ? 'seuil_dependance = ' : 'seuil_dependance <- ');
  }

  function readOnly(path) { return /^(data|sorties)\//.test(path); }

  function readOnlyNote(path) {
    if (/^data\//.test(path)) {
      return '<strong>Données, en lecture seule.</strong> Ce fichier est ignoré par Git (<code>data/</code> dans <code>.gitignore</code>)&nbsp;: ' +
        'en vrai, les données vivent sur le stockage S3, pas dans le dépôt.';
    }
    return '<strong>Sortie, en lecture seule.</strong> Ce fichier est produit par le script d\'analyse et ignoré par Git ' +
      '(<code>sorties/</code> dans <code>.gitignore</code>)&nbsp;: on le régénère, on ne le versionne pas.';
  }

  // Le message d'accueil du terminal, affiché une fois par visite.
  // {w}…{/} : gras ; {y}…{/} : une commande à taper.
  var ACCUEIL = [
    '{w}Bienvenue dans le bac à sable Git 👋{/}',
    '',
    'Ici, impossible de casser la prod.',
    'Testez. Modifiez. Ratez. Recommencez.',
    '',
    'Git est justement là pour garder la trace.',
    '',
    'Un doute\u00a0?',
    '{y}git status{/} est votre meilleur ami.',
    '{y}help{/} vous donne un coup de pouce.',
    '',
    'À vous de jouer.'
  ];

  var config = {
    project: 'entreprises_defense',
    welcome: ACCUEIL,
    languages: [{ id: 'R', label: 'R' }, { id: 'Python', label: 'Python' }],
    fileFor: fileFor,
    swapLang: swapLang,
    readOnly: readOnly,
    readOnlyNote: readOnlyNote,
    missions: missions,
    storageKey: 'atelier1-bac-a-sable:v1'
  };

  var api = {
    KIT: KIT, GITIGNORE: GITIGNORE, SYNTHESE: SYNTHESE, ACCUEIL: ACCUEIL,
    fichiers: fichiers, fileFor: fileFor, swapLang: swapLang,
    EDITS: EDITS, missions: missions, config: config, RE: RE
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.AtelierBacASable = api;
    if (document.getElementById('atelier')) {
      (root.__gwPending = root.__gwPending || []).push(['#atelier', config]);
    }
  }
})(typeof window !== 'undefined' ? window : this);
