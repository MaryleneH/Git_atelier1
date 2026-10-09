# Atelier 1 · Je regarde, je choisis, j'enregistre

Supports du premier atelier Git/GitLab « Git sans douleur » : deux heures pour apprendre à **retrouver n'importe quelle version de son étude**. Le public : des statisticiens et data scientists qui travaillent en R ou en Python dans VS Code, sur une instance Onyxia interne, avec un GitLab interne.

Le site contient :

| Page | Contenu |
|---|---|
| `index.qmd` | Accueil : programme, prérequis, liens |
| `slides.qmd` | Le diaporama complet (Reveal.js), notes formateur incluses (touche `S`) |
| `atelier.qmd` | Le guide participant, pas à pas |
| `setup.qmd` | Préparer son poste : Onyxia, VS Code, Git, le kit (étapes 1 à 4) |
| `prerequis.qmd` | Le pré-travail (étapes 1 à 5), la checklist J-7 |
| `_preparation-poste.qmd` | Les étapes 1 à 4, source commune incluse dans les deux pages précédentes |
| `bac-a-sable.qmd` | L'étude dans le navigateur : explorateur, éditeur, terminal Git, trois zones ; prise en main, 4 missions, un défi |
| `memo.qmd` | Le tableau problème → commande |
| `materiel/` | Le mémo A4 et les cartes de tri (jeu de base et séries supplémentaires, en versions R et Python, formules selon le temps et corrigés), en PDF (Typst) |
| `kit/kit.sh` | Le script qui crée les dossiers d'exercice sur Onyxia |

Toute l'étude `entreprises_defense` est **fictive** : aucune donnée réelle, aucun nom d'entreprise réel.

## Avant l'atelier : remplir `_variables.yml`

Tout ce qui dépend de votre environnement vit dans `_variables.yml`, et nulle part ailleurs :

| Variable | Rôle |
|---|---|
| `gitlab_url` | Adresse du GitLab interne |
| `onyxia_url` | Adresse de l'instance Onyxia |
| `film_url` | Lien YouTube du film « Le Nouveau » |
| `organisme` | Nom de l'organisme, tel qu'il s'affiche dans les phrases (« le bureau des études économiques ») |
| `atelier_date` | Date et horaire de l'atelier |
| `site_url` | Adresse publique du site |

Chaque valeur est reprise automatiquement dans les pages, les slides et les supports imprimables.

## Rendre le site localement

Il faut [Quarto](https://quarto.org/docs/get-started/) 1.6 ou plus récent. Ni R ni Python ne sont nécessaires : aucun code n'est exécuté au rendu (`execute: enabled: false`).

```bash
quarto preview          # aperçu en direct
quarto render           # rendu complet dans _site/
```

Les PDF de `materiel/` (mémo A4, cartes de tri) sont produits par Typst, fourni avec Quarto, avec les polices de l'identité rangées dans `assets/fonts/` (instances statiques de Fraunces, Public Sans et JetBrains Mono, licence OFL).

## Le guide d'animation (hors site)

Le guide de la formatrice (préparation, déroulé minute par minute avec le discours et les sorties attendues, corrigés, dépannage, plan B) n'est **pas publié sur le site**. Il vit dans `formateur/`, un projet Quarto à part, exclu du rendu du site (`project.render` dans `_quarto.yml`), et se produit en PDF :

```bash
cd formateur && quarto render    # → formateur/guide-formateur.pdf
```

Attention : le dépôt étant public, `formateur/` reste lisible par tous sur GitHub. Seul le site ne l'expose pas.

## Vérifier le kit d'exercices

```bash
bash kit/test_kit.sh
```

Le test lance `kit.sh` plusieurs fois, en R puis en Python, et vérifie que l'historique de Marie a toujours les mêmes empreintes, que le dossier vierge n'a pas de `.git`, et que ces empreintes figurent bien dans le guide d'animation (`formateur/guide-formateur.qmd`). Si R (avec readr, dplyr, ggplot2) ou Python (avec pandas, matplotlib) est installé, il vérifie aussi que `03_analyse` échoue au dernier commit de Marie et fonctionne au commit 6.

**Une panne est voulue.** Dans `entreprises_defense_marie/`, le dernier commit de Marie ne fonctionne pas : `scripts/03_analyse` et `rapport.qmd` s'arrêtent sur ``Column `secteur` is not found``. Le commit 7 (`b0b1445`) ajoute un `group_by(secteur)` alors que les données n'ont qu'une colonne `naf`. C'est l'enquête du Temps 3 (« Vendredi, ça marchait ») : les stagiaires retrouvent ce commit et reviennent à la version de vendredi avec `git restore --source`. Ne la corrigez pas dans `kit.sh`. `entreprises_defense/`, lui, doit se rendre sans erreur.

**Après toute modification de `kit.sh`, relancez le test et reportez les nouvelles empreintes dans `formateur/guide-formateur.qmd`** (ainsi que dans les slides, le guide participant et la page de préparation, qui citent celles de Marie), puis régénérez le PDF.

## Tester le bac à sable

Le bac à sable (`bac-a-sable.qmd`) repose sur un fork de l'extension `git-sandbox`, dont les sources et les tests sont dans `sandbox/` :

```bash
cd sandbox && npm ci && bash tests/run.sh
```

Les suites vérifient le moteur Git (diff, `diff --staged`, `restore`, etc.), le déroulé complet de chaque mission en R et en Python, et que les sorties sont **identiques à celles du vrai Git**. Après toute modification de `sandbox/src/`, relancer `bash sandbox/build.sh` pour régénérer l'extension. Le parcours dans un vrai navigateur est décrit dans `sandbox/README.md`.

## Publier sur GitHub Pages

Le workflow `.github/workflows/publish.yml` rend le site et le déploie directement par GitHub Actions à chaque push sur `main` (ou à la demande, depuis l'onglet *Actions* : *Run workflow*). Il n'y a pas de branche `gh-pages`.

Une seule fois, dans GitHub : **Settings → Pages → Build and deployment → Source : *GitHub Actions***. Le workflow tente aussi de l'activer lui-même au premier passage.

## Mettre à jour les supports

- Modifier une page : éditer le `.qmd`, vérifier avec `quarto preview`, puis commiter.
- Modifier le kit : éditer `kit/kit.sh`, lancer `bash kit/test_kit.sh`, puis reporter les nouvelles empreintes dans `formateur/guide-formateur.qmd` et régénérer le PDF.
- Montrer le film sans YouTube : déposer le fichier dans `video/le-nouveau.mp4`. Le dossier `video/` est ignoré par Git.

Les commits de ce dépôt suivent la règle enseignée dans l'atelier : de petits commits, un message en français, à l'impératif, qui décrit l'intention.

## Crédits

- Identité visuelle : cours « Git sans douleur — Jour 1 ».
- Polices : [Fraunces](https://github.com/undercasetype/Fraunces), [Public Sans](https://github.com/uswds/public-sans), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), licence SIL OFL 1.1 (textes dans `assets/fonts/`).
- Bac à sable : fork de l'extension [quarto-git-sandbox](https://github.com/ryjohnson09/quarto-git-sandbox) de Ryan Johnson, licence MIT. Les sources et les tests sont dans `sandbox/` (voir `sandbox/README.md`), le fichier construit dans `_extensions/git-sandbox/`.
