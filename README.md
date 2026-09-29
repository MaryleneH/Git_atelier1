# Atelier 1 · Je regarde, je choisis, j'enregistre

Supports du premier atelier Git/GitLab « Git sans douleur » : deux heures pour apprendre à **retrouver n'importe quelle version de son étude**. Le public : des statisticiens et data scientists qui travaillent en R ou en Python dans VS Code, sur une instance Onyxia interne, avec un GitLab interne.

Le site contient :

| Page | Contenu |
|---|---|
| `index.qmd` | Accueil : programme, prérequis, liens |
| `slides.qmd` | Le diaporama complet (Reveal.js), notes formateur incluses (touche `S`) |
| `atelier.qmd` | Le guide participant, pas à pas |
| `prerequis.qmd` | Le pré-travail, le modèle de mail J-3, la checklist J-7 |
| `bac-a-sable.qmd` | Trois exercices Git dans le navigateur (extension `git-sandbox`) |
| `memo.qmd` | Le tableau problème → commande |
| `formateur.qmd` | Le guide d'animation : minutage, matériel, corrigés, plan B |
| `materiel/` | Le mémo A4 et les 12 cartes de tri, en PDF (Typst) |
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

## Vérifier le kit d'exercices

```bash
bash kit/test_kit.sh
```

Le test lance `kit.sh` plusieurs fois, en R puis en Python, et vérifie que l'historique de Marie a toujours les mêmes empreintes, que le dossier vierge n'a pas de `.git`, et que ces empreintes figurent bien dans `formateur.qmd`. Si R (avec readr, dplyr, ggplot2) ou Python (avec pandas, matplotlib) est installé, il vérifie aussi que `03_analyse` échoue au dernier commit de Marie et fonctionne au commit 6.

**Après toute modification de `kit.sh`, relancez le test et reportez les nouvelles empreintes dans `formateur.qmd`** (et dans les slides, le guide et la page de préparation, qui citent celles de Marie).

## Publier sur GitHub Pages

Le workflow `.github/workflows/publish.yml` rend le site et le pousse sur la branche `gh-pages` à chaque push sur `main` (il crée cette branche la première fois).

Une seule fois, dans GitHub : **Settings → Pages → Build and deployment → Source : *Deploy from a branch*** puis choisir la branche **`gh-pages`**, dossier **`/ (root)`**.

## Mettre à jour les supports

- Modifier une page : éditer le `.qmd`, vérifier avec `quarto preview`, puis commiter.
- Modifier le kit : éditer `kit/kit.sh`, lancer `bash kit/test_kit.sh`, puis reporter les nouvelles empreintes dans `formateur.qmd`.
- Montrer le film sans YouTube : déposer le fichier dans `video/le-nouveau.mp4`. Le dossier `video/` est ignoré par Git.

Les commits de ce dépôt suivent la règle enseignée dans l'atelier : de petits commits, un message en français, à l'impératif, qui décrit l'intention.

## Crédits

- Identité visuelle : cours « Git sans douleur — Jour 1 ».
- Polices : [Fraunces](https://github.com/undercasetype/Fraunces), [Public Sans](https://github.com/uswds/public-sans), [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), licence SIL OFL 1.1 (textes dans `assets/fonts/`).
- Bac à sable : extension [quarto-git-sandbox](https://github.com/ryjohnson09/quarto-git-sandbox) de Ryan Johnson, licence MIT (copie dans `_extensions/git-sandbox/`).
