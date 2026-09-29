#!/usr/bin/env bash
# ============================================================
# kit.sh — Atelier 1 · Je regarde, je choisis, j'enregistre
#
# Crée les deux dossiers d'exercice de l'atelier :
#   entreprises_defense/        l'étude, sans historique (pas de .git)
#   entreprises_defense_marie/  la même étude, avec l'historique de Marie
#
# Utilisation :
#   bash kit.sh                  variante R, dans ~/atelier-git
#   bash kit.sh --python         variante Python (pandas)
#   bash kit.sh --force          recrée les dossiers s'ils existent déjà
#   bash kit.sh --dest <dossier> crée les dossiers ailleurs
#
# Toutes les données sont synthétiques : aucune entreprise réelle.
# Les 8 commits de Marie ont des dates, des auteurs et des messages
# fixés : leurs empreintes sont identiques sur tous les postes.
# ============================================================

if [ -z "${BASH_VERSION:-}" ]; then
  echo "Lancez ce script avec bash : bash kit.sh" >&2
  exit 1
fi
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  echo "Ce script demande bash 4 ou plus récent (version actuelle : $BASH_VERSION)." >&2
  exit 1
fi

set -euo pipefail

LANGAGE="R"
FORCE=0
DEST="${HOME}/atelier-git"

aide() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
}

while [ $# -gt 0 ]; do
  case "$1" in
    --python) LANGAGE="Python" ;;
    --force) FORCE=1 ;;
    --dest)
      if [ $# -lt 2 ]; then
        echo "L'option --dest attend un dossier : bash kit.sh --dest <dossier>" >&2
        exit 1
      fi
      DEST="$2"
      shift
      ;;
    -h|--help) aide; exit 0 ;;
    *)
      echo "Option inconnue : $1 (options possibles : --python, --force, --dest <dossier>)" >&2
      exit 1
      ;;
  esac
  shift
done

# --- Vérifications -------------------------------------------

if ! command -v git > /dev/null 2>&1; then
  echo "Git n'est pas installé dans ce service. Relancez un service VS Code depuis Onyxia." >&2
  exit 1
fi
echo "Git est bien là : $(git --version)"

if [ -z "$(git config --global --get init.defaultBranch 2> /dev/null || true)" ]; then
  if git config --global init.defaultBranch main 2> /dev/null; then
    echo "Réglage posé : les nouveaux dépôts auront une branche « main » (init.defaultBranch)."
  else
    echo "Attention : impossible de régler init.defaultBranch. Tapez : git config --global init.defaultBranch main"
  fi
fi

if [ -z "$(git config --get user.name 2> /dev/null || true)" ] || [ -z "$(git config --get user.email 2> /dev/null || true)" ]; then
  echo
  echo "Attention : votre nom ou votre email n'est pas configuré pour Git."
  echo "Onyxia les renseigne normalement (Mon compte). Sinon, tapez :"
  echo '  git config --global user.name "Prénom Nom"'
  echo '  git config --global user.email "prenom.nom@exemple.fr"'
  echo
fi

mkdir -p "$DEST"
DEST="$(cd "$DEST" && pwd)"
VIERGE="$DEST/entreprises_defense"
MARIE="$DEST/entreprises_defense_marie"

for dossier in "$VIERGE" "$MARIE"; do
  if [ -e "$dossier" ]; then
    if [ "$FORCE" -eq 1 ]; then
      rm -rf "$dossier"
    else
      echo "Le dossier $dossier existe déjà : je ne l'écrase pas." >&2
      echo "Pour le recréer (tout son contenu sera perdu) : bash kit.sh --force" >&2
      exit 1
    fi
  fi
done

if [ "$LANGAGE" = "R" ]; then EXT="R"; else EXT="py"; fi

# --- Contenu de l'étude --------------------------------------
# Chaque fonction écrit un fichier dans le dossier courant.
# Le numéro de version suit l'historique de Marie.

ecrire_readme() {
  if [ "$LANGAGE" = "R" ]; then
    lancer='Rscript scripts/03_analyse.R    # produit figures/effectifs_par_taille.png'
    paquets='Packages R : readr, dplyr, ggplot2.'
  else
    lancer='python scripts/03_analyse.py    # produit figures/effectifs_par_taille.png'
    paquets='Paquets Python : pandas, matplotlib.'
  fi
  cat > README.md <<EOF
# Entreprises liées à la défense — étude 2024

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
    scripts/01_import.$EXT               lecture du fichier
    scripts/02_nettoyage.$EXT            part de CA défense, taille, filtre
    scripts/03_analyse.$EXT              effectifs par taille, graphique
    rapport.qmd                         rapport Quarto

## Comment lancer

    $lancer
    quarto render rapport.qmd

$paquets
EOF
}

ecrire_donnees() {
  mkdir -p data
  cat > data/entreprises_defense_2024.csv <<'EOF'
siren,raison_sociale,naf,departement,effectifs,ca_total_keur,ca_defense_keur
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
EOF
}

ecrire_import() {
  mkdir -p scripts
  if [ "$LANGAGE" = "R" ]; then
    cat > scripts/01_import.R <<'EOF'
# Import de l'extrait entreprises_defense_2024
library(readr)
library(dplyr)

entreprises_brut <- read_csv(
  "data/entreprises_defense_2024.csv",
  col_types = cols(siren = col_character(), departement = col_character())
)
EOF
  else
    cat > scripts/01_import.py <<'EOF'
# Import de l'extrait entreprises_defense_2024
import pandas as pd

entreprises_brut = pd.read_csv(
    "data/entreprises_defense_2024.csv",
    dtype={"siren": str, "departement": str},
)
EOF
  fi
}

# Version 1 : seuil et filtre ; 2 : + taille ; 3 : + dédoublonnage (Franck)
ecrire_nettoyage() {
  local version="$1"
  mkdir -p scripts
  if [ "$LANGAGE" = "R" ]; then
    {
      cat <<'EOF'
# Nettoyage : ne garder que les entreprises dépendantes de la défense
source("scripts/01_import.R")

seuil_dependance <- 0.20

entreprises <- entreprises_brut |>
EOF
      if [ "$version" -ge 3 ]; then
        cat <<'EOF'
  # Un même SIREN ne doit compter qu'une fois
  distinct(siren, .keep_all = TRUE) |>
EOF
      fi
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'
  mutate(
    part_ca_defense = ca_defense_keur / ca_total_keur,
    taille = case_when(
      effectifs < 250 ~ "PME",
      effectifs < 5000 ~ "ETI",
      TRUE ~ "GE"
    )
  ) |>
EOF
      else
        cat <<'EOF'
  mutate(part_ca_defense = ca_defense_keur / ca_total_keur) |>
EOF
      fi
      cat <<'EOF'
  filter(part_ca_defense >= seuil_dependance)
EOF
    } > scripts/02_nettoyage.R
  else
    {
      cat <<'EOF'
# Nettoyage : ne garder que les entreprises dépendantes de la défense
exec(open("scripts/01_import.py", encoding="utf-8").read())

seuil_dependance = 0.20

EOF
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'

def classe_taille(effectifs):
    if effectifs < 250:
        return "PME"
    if effectifs < 5000:
        return "ETI"
    return "GE"


EOF
      fi
      if [ "$version" -ge 3 ]; then
        cat <<'EOF'
# Un même SIREN ne doit compter qu'une fois
entreprises = entreprises_brut.drop_duplicates(subset="siren").copy()
EOF
      else
        cat <<'EOF'
entreprises = entreprises_brut.copy()
EOF
      fi
      cat <<'EOF'
entreprises["part_ca_defense"] = entreprises["ca_defense_keur"] / entreprises["ca_total_keur"]
EOF
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'
entreprises["taille"] = entreprises["effectifs"].apply(classe_taille)
EOF
      fi
      cat <<'EOF'
entreprises = entreprises[entreprises["part_ca_defense"] >= seuil_dependance]
EOF
    } > scripts/02_nettoyage.py
  fi
}

# Version 1 : effectifs ; 2 : parts (%) ; 3 : + ventilation NAF (cassée)
ecrire_analyse() {
  local version="$1"
  mkdir -p scripts
  if [ "$LANGAGE" = "R" ]; then
    {
      cat <<'EOF'
# Analyse : les entreprises liées à la défense, par taille
source("scripts/02_nettoyage.R")
library(ggplot2)

effectifs_taille <- entreprises |>
EOF
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'
  count(taille, name = "effectifs") |>
  mutate(part = effectifs / sum(effectifs))
EOF
      else
        cat <<'EOF'
  count(taille, name = "effectifs")
EOF
      fi
      if [ "$version" -ge 3 ]; then
        cat <<'EOF'

# Ventilation par secteur d'activité (NAF)
effectifs_secteur <- entreprises |>
  group_by(secteur, taille) |>
  summarise(effectifs = n(), .groups = "drop")
EOF
      fi
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'

graphique <- ggplot(effectifs_taille, aes(x = taille, y = part)) +
  geom_col(fill = "#0f766e") +
  scale_y_continuous(labels = scales::percent) +
  labs(
    title = "Entreprises liées à la défense, par taille",
    x = NULL,
    y = "Part des entreprises"
  )
EOF
      else
        cat <<'EOF'

graphique <- ggplot(effectifs_taille, aes(x = taille, y = effectifs)) +
  geom_col(fill = "#0f766e") +
  labs(
    title = "Entreprises liées à la défense, par taille",
    x = NULL,
    y = "Nombre d'entreprises"
  )
EOF
      fi
      cat <<'EOF'

dir.create("figures", showWarnings = FALSE)
ggsave("figures/effectifs_par_taille.png", graphique, width = 7, height = 4)
EOF
    } > scripts/03_analyse.R
  else
    {
      cat <<'EOF'
# Analyse : les entreprises liées à la défense, par taille
exec(open("scripts/02_nettoyage.py", encoding="utf-8").read())
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
EOF
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'
from matplotlib.ticker import PercentFormatter
EOF
      fi
      cat <<'EOF'

effectifs_taille = (
    entreprises.groupby("taille").size().rename("effectifs").reset_index()
)
EOF
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'
effectifs_taille["part"] = effectifs_taille["effectifs"] / effectifs_taille["effectifs"].sum()
EOF
      fi
      if [ "$version" -ge 3 ]; then
        cat <<'EOF'

# Ventilation par secteur d'activité (NAF)
effectifs_secteur = (
    entreprises.groupby(["secteur", "taille"]).size().rename("effectifs").reset_index()
)
EOF
      fi
      if [ "$version" -ge 2 ]; then
        cat <<'EOF'

fig, ax = plt.subplots(figsize=(7, 4))
ax.bar(effectifs_taille["taille"], effectifs_taille["part"], color="#0f766e")
ax.yaxis.set_major_formatter(PercentFormatter(1))
ax.set_title("Entreprises liées à la défense, par taille")
ax.set_ylabel("Part des entreprises")
EOF
      else
        cat <<'EOF'

fig, ax = plt.subplots(figsize=(7, 4))
ax.bar(effectifs_taille["taille"], effectifs_taille["effectifs"], color="#0f766e")
ax.set_title("Entreprises liées à la défense, par taille")
ax.set_ylabel("Nombre d'entreprises")
EOF
      fi
      cat <<'EOF'

os.makedirs("figures", exist_ok=True)
fig.savefig("figures/effectifs_par_taille.png", dpi=150)
EOF
    } > scripts/03_analyse.py
  fi
}

# Version 1 : champ, méthode, graphique ; 2 : + résultats 2024 chiffrés
ecrire_rapport() {
  local version="$1"
  local ouvre calcul graphique
  if [ "$LANGAGE" = "R" ]; then
    ouvre='```{r}'
    calcul='source("scripts/03_analyse.R")'
    graphique='graphique'
  else
    ouvre='```{python}'
    calcul='exec(open("scripts/03_analyse.py", encoding="utf-8").read())'
    graphique='fig'
  fi
  {
    cat <<EOF
---
title: "Les entreprises liées à la défense en 2024"
subtitle: "Étude entreprises_defense — document de travail"
author: "Marie"
lang: fr
format: html
---

$ouvre
#| include: false
$calcul
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

EOF
    if [ "$version" -ge 2 ]; then
      if [ "$LANGAGE" = "R" ]; then
        cat <<'EOF'
En 2024, `r nrow(entreprises)` entreprises de l'extrait atteignent le seuil
de dépendance. Leur répartition par taille est la suivante.

```{r}
#| echo: false
knitr::kable(effectifs_taille, col.names = c("Taille", "Nombre", "Part"), digits = 2)
```

EOF
      else
        cat <<'EOF'
En 2024, `{python} len(entreprises)` entreprises de l'extrait atteignent le
seuil de dépendance. Leur répartition par taille est la suivante.

```{python}
#| echo: false
effectifs_taille
```

EOF
      fi
    fi
    cat <<EOF
$ouvre
#| echo: false
$graphique
\`\`\`
EOF
  } > rapport.qmd
}

ecrire_brouillon() {
  if [ "$LANGAGE" = "R" ]; then
    cat > brouillon_test.R <<'EOF'
# brouillon — essais rapides, à ne pas garder
x <- read.csv("data/entreprises_defense_2024.csv")
head(x)
summary(x$effectifs)
table(x$naf)
plot(x$effectifs, x$ca_defense_keur)
EOF
  else
    cat > brouillon_test.py <<'EOF'
# brouillon — essais rapides, à ne pas garder
import pandas as pd

x = pd.read_csv("data/entreprises_defense_2024.csv")
print(x.head())
print(x["effectifs"].describe())
print(x["naf"].value_counts())
EOF
  fi
}

# Fichiers qui traînent chez Marie, jamais commités (Temps 4)
ecrire_fichiers_non_suivis() {
  mkdir -p data figures
  # Faux parquet de 2 Mo (le vrai fait 600 Mo)
  {
    printf 'PAR1'
    head -c $((2 * 1024 * 1024 - 8)) /dev/zero
    printf 'PAR1'
  } > data/bitd_2024.parquet
  # PNG valide d'un pixel
  printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' \
    | base64 -d > figures/effectifs_par_taille.png
  cat > rapport.html <<'EOF'
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Les entreprises liées à la défense en 2024</title></head>
<body>
<h1>Les entreprises liées à la défense en 2024</h1>
<p>Rendu produit par quarto render rapport.qmd : fichier régénérable.</p>
</body>
</html>
EOF
  cat > .Rhistory <<'EOF'
source("scripts/03_analyse.R")
entreprises |> count(taille)
View(entreprises)
EOF
  cat > .Renviron <<'EOF'
GITLAB_TOKEN=glpat-EXEMPLE-FICTIF-ne-pas-commiter
EOF
  printf '%s\n' "Fichier factice pour l'atelier : ne contient aucune donnée." \
    > donnees_entreprises_confidentiel.xlsx
  cat > notes_reunion_chef_de_bureau.md <<'EOF'
# Réunion avec le chef de bureau — 11 septembre

- Passer le graphique des effectifs en parts : plus lisible pour la note de synthèse.
- Ventiler par secteur d'activité (NAF) ? À voir la semaine prochaine.
- Ne jamais diffuser la liste nominative des entreprises (secret statistique).
EOF
}

# --- Git isolé de la configuration du poste -------------------
# Aucun réglage global (hooks, signature, fins de ligne, attributs)
# ne doit changer le contenu des commits : sinon les empreintes
# différeraient d'un poste à l'autre.
git_isole() {
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null \
    git -c core.autocrlf=false -c core.safecrlf=false \
        -c core.hooksPath=/dev/null -c core.attributesFile=/dev/null \
        -c commit.gpgsign=false -c advice.detachedHead=false "$@"
}

commit_date() {
  local date="$1" auteur="$2" message="$3"
  shift 3
  local nom email
  case "$auteur" in
    Marie) nom="Marie"; email="marie@exemple.fr" ;;
    Franck) nom="Franck"; email="franck@exemple.fr" ;;
  esac
  git_isole add -- "$@"
  GIT_AUTHOR_NAME="$nom" GIT_AUTHOR_EMAIL="$email" GIT_AUTHOR_DATE="$date" \
  GIT_COMMITTER_NAME="$nom" GIT_COMMITTER_EMAIL="$email" GIT_COMMITTER_DATE="$date" \
    git_isole -c user.name="$nom" -c user.email="$email" commit -q -m "$message"
}

# --- 1. entreprises_defense/ : l'étude, sans historique -------

mkdir -p "$VIERGE"
(
  cd "$VIERGE"
  ecrire_readme
  ecrire_donnees
  ecrire_import
  ecrire_nettoyage 3
  ecrire_analyse 2
  ecrire_rapport 2
  ecrire_brouillon
)

# --- 2. entreprises_defense_marie/ : l'historique de Marie ----

mkdir -p "$MARIE"
(
  cd "$MARIE"
  git_isole -c init.defaultBranch=main init -q
  git_isole symbolic-ref HEAD refs/heads/main

  ecrire_readme
  commit_date "2026-09-01T09:12:00+02:00" Marie \
    "Initialise l'étude des entreprises liées à la défense" \
    README.md

  ecrire_import
  ecrire_donnees
  commit_date "2026-09-02T10:40:00+02:00" Marie \
    "Ajoute l'import de l'extrait entreprises_defense_2024" \
    "scripts/01_import.$EXT" data/entreprises_defense_2024.csv

  ecrire_nettoyage 1
  commit_date "2026-09-04T15:05:00+02:00" Marie \
    "Ne garde que les entreprises dont la part de CA défense dépasse 20 %" \
    "scripts/02_nettoyage.$EXT"

  ecrire_nettoyage 2
  ecrire_analyse 1
  ecrire_rapport 1
  commit_date "2026-09-08T11:30:00+02:00" Marie \
    "Ajoute la ventilation par taille d'entreprise (PME, ETI, GE)" \
    "scripts/02_nettoyage.$EXT" "scripts/03_analyse.$EXT" rapport.qmd

  ecrire_nettoyage 3
  commit_date "2026-09-10T16:48:00+02:00" Franck \
    "Corrige le calcul du CA défense (doublons de SIREN)" \
    "scripts/02_nettoyage.$EXT"

  ecrire_analyse 2
  commit_date "2026-09-11T17:20:00+02:00" Marie \
    "Passe le graphique des effectifs en parts (%) à la demande du chef de bureau" \
    "scripts/03_analyse.$EXT"

  ecrire_analyse 3
  commit_date "2026-09-14T09:05:00+02:00" Marie \
    "Ajoute la ventilation par secteur d'activité (NAF)" \
    "scripts/03_analyse.$EXT"

  ecrire_rapport 2
  commit_date "2026-09-16T14:10:00+02:00" Marie \
    "Met à jour le rapport avec les résultats 2024" \
    rapport.qmd

  ecrire_fichiers_non_suivis
)

# --- Bilan ----------------------------------------------------

echo
echo "Kit prêt (variante $LANGAGE)."
echo
echo "  $VIERGE"
echo "      l'étude, sans historique : c'est vous qui ferez git init"
echo "  $MARIE"
echo "      l'étude de Marie, avec son historique :"
echo
git_isole -C "$MARIE" --no-pager log --oneline | sed 's/^/      /'
echo
echo "Pour commencer : cd $VIERGE"
