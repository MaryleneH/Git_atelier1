#!/usr/bin/env bash
# ============================================================
# test_kit.sh — vérifie kit.sh avant chaque atelier
#
#   bash kit/test_kit.sh
#
# Vérifie, pour la variante R puis la variante Python :
#   - deux exécutions donnent exactement les mêmes empreintes ;
#   - une relance avec --force redonne ces empreintes ;
#   - sans --force, le kit refuse d'écraser ;
#   - entreprises_defense/ n'a pas de .git ;
#   - l'historique de Marie a 8 commits et 7 fichiers non suivis ;
#   - si R (ou pandas) est disponible : 03_analyse échoue au
#     dernier commit et réussit au commit 6 ;
#   - les empreintes figurent dans le guide d'animation
#     (formateur/guide-formateur.qmd).
# ============================================================

set -euo pipefail

ICI="$(cd "$(dirname "$0")" && pwd)"
RACINE="$(cd "$ICI/.." && pwd)"
KIT="$ICI/kit.sh"
FORMATEUR="$RACINE/formateur/guide-formateur.qmd"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Un HOME vide : le test ne touche pas à la configuration Git du poste
export HOME="$TMP/home"
mkdir -p "$HOME"
unset GIT_CONFIG_GLOBAL || true

ECHECS=0
ok() { echo "  ok    $1"; }
ko() { echo "  ECHEC $1"; ECHECS=$((ECHECS + 1)); }
verifie() { if eval "$2"; then ok "$1"; else ko "$1"; fi; }

empreintes() { git -C "$1/entreprises_defense_marie" log --format=%H; }

# Exécute scripts/03_analyse.<ext> dans une copie du commit demandé
analyse_passe() {
  local depot="$1" commit="$2" commande="$3" copie
  copie="$(mktemp -d -p "$TMP")"
  git -C "$depot" archive "$commit" | tar -x -C "$copie"
  (cd "$copie" && eval "$commande" > /dev/null 2>&1)
}

echo "kit.sh : $KIT"

verifie "kit.sh ne contient aucune espace insécable (copier-coller sûr)" \
  "! LC_ALL=C grep -q \$'\\xc2\\xa0\\|\\xe2\\x80\\xaf' '$KIT'"

for variante in R Python; do
  echo
  echo "== Variante $variante"
  option=""
  [ "$variante" = "Python" ] && option="--python"

  A="$TMP/$variante-a"
  B="$TMP/$variante-b"
  bash "$KIT" $option --dest "$A" > "$TMP/sortie-a.txt"
  bash "$KIT" $option --dest "$B" > /dev/null

  verifie "deux exécutions donnent les mêmes empreintes" \
    "[ \"\$(empreintes '$A')\" = \"\$(empreintes '$B')\" ]"

  verifie "sans --force, le kit refuse d'écraser" \
    "! bash '$KIT' $option --dest '$A' > /dev/null 2>&1"

  avant="$(empreintes "$A")"
  bash "$KIT" $option --force --dest "$A" > /dev/null
  verifie "une relance avec --force redonne les mêmes empreintes" \
    "[ \"\$(empreintes '$A')\" = \"\$avant\" ]"

  verifie "entreprises_defense/ n'a pas de .git" \
    "[ ! -e '$A/entreprises_defense/.git' ]"

  verifie "l'historique de Marie compte 8 commits" \
    "[ \"\$(git -C '$A/entreprises_defense_marie' rev-list --count HEAD)\" = 8 ]"

  verifie "la branche de Marie s'appelle main" \
    "[ \"\$(git -C '$A/entreprises_defense_marie' symbolic-ref --short HEAD)\" = main ]"

  verifie "Marie a 7 fichiers ou dossiers non suivis, et pas de .gitignore" \
    "[ \"\$(git -C '$A/entreprises_defense_marie' status --porcelain | grep -c '^??')\" = 7 ] && [ ! -e '$A/entreprises_defense_marie/.gitignore' ]"

  verifie "le kit affiche le git log --oneline de Marie" \
    "grep -q 'Met à jour le rapport avec les résultats 2024' '$TMP/sortie-a.txt'"

  marie="$A/entreprises_defense_marie"
  if [ "$variante" = "R" ]; then
    if command -v Rscript > /dev/null 2>&1 \
      && Rscript -e 'library(readr); library(dplyr); library(ggplot2)' > /dev/null 2>&1; then
      verifie "03_analyse.R échoue au dernier commit" \
        "! analyse_passe '$marie' HEAD 'Rscript scripts/03_analyse.R'"
      verifie "03_analyse.R réussit au commit 6" \
        "analyse_passe '$marie' HEAD~2 'Rscript scripts/03_analyse.R'"
      verifie "03_analyse.R réussit dans entreprises_defense/" \
        "(cd '$A/entreprises_defense' && Rscript scripts/03_analyse.R > /dev/null 2>&1)"
    else
      echo "  --    R (readr, dplyr, ggplot2) indisponible : exécution des scripts non vérifiée"
    fi
  else
    if command -v python3 > /dev/null 2>&1 \
      && python3 -c 'import pandas, matplotlib' > /dev/null 2>&1; then
      verifie "03_analyse.py échoue au dernier commit" \
        "! analyse_passe '$marie' HEAD 'python3 scripts/03_analyse.py'"
      verifie "03_analyse.py réussit au commit 6" \
        "analyse_passe '$marie' HEAD~2 'python3 scripts/03_analyse.py'"
      verifie "03_analyse.py réussit dans entreprises_defense/" \
        "(cd '$A/entreprises_defense' && python3 scripts/03_analyse.py > /dev/null 2>&1)"
    else
      echo "  --    pandas ou matplotlib indisponible : exécution des scripts non vérifiée"
    fi
  fi

  echo
  echo "  Empreintes (variante $variante), du commit 1 au commit 8 :"
  git -C "$marie" log --reverse --format='    %h  %H  %s'

  if [ -f "$FORMATEUR" ]; then
    manquantes=0
    for h in $(empreintes "$A"); do
      grep -q "$h" "$FORMATEUR" || manquantes=$((manquantes + 1))
    done
    verifie "les 8 empreintes figurent dans le guide d'animation" "[ $manquantes -eq 0 ]"
  else
    echo "  --    guide d'animation absent : empreintes non comparées"
  fi
done

echo
echo "== Destination par défaut"
# Lancé sans --dest, depuis un autre dossier : le kit va dans ~/work/atelier-git
mkdir -p "$TMP/ailleurs"
(cd "$TMP/ailleurs" && bash "$KIT" > "$TMP/sortie-defaut.txt")
verifie "sans --dest, les deux dossiers sont dans ~/work/atelier-git" \
  "[ -d '$HOME/work/atelier-git/entreprises_defense' ] && [ -d '$HOME/work/atelier-git/entreprises_defense_marie/.git' ]"
verifie "rien n'est créé dans le dossier courant" \
  "[ -z \"\$(ls -A '$TMP/ailleurs')\" ]"
verifie "le message final indique ce chemin" \
  "grep -q 'Pour commencer : cd $HOME/work/atelier-git/entreprises_defense' '$TMP/sortie-defaut.txt'"

echo
if [ "$ECHECS" -eq 0 ]; then
  echo "Tout est vert."
else
  echo "$ECHECS vérification(s) en échec."
  exit 1
fi
