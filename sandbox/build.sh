#!/usr/bin/env bash
# Reconstruit le JavaScript de l'extension à partir de sandbox/src/.
#
#   bash sandbox/build.sh
#
# Le fichier produit, _extensions/git-sandbox/resources/git-sandbox.js,
# est celui que le site charge. Ne jamais le modifier à la main.

set -euo pipefail
cd "$(dirname "$0")"

OUT=../_extensions/git-sandbox/resources/git-sandbox.js
{
  cat <<'HDR'
/* =====================================================================
   git-sandbox.js — a real git repository that lives entirely in the page.

   Runs isomorphic-git (MIT) against an in-memory filesystem, and renders a
   terminal, a working-directory/staging/repository diagram, and a live commit
   graph. Nothing is sent to a server; nothing is written to disk.

   GENERATED FILE — do not edit. Built from src/ by ./build.sh.
   ===================================================================== */

HDR
  cat src/sandbox-core.js
  echo; echo
  cat src/sandbox-when.js
  echo; echo
  cat src/sandbox-ui.js
  if [ -f src/sandbox-workbench.js ]; then
    echo; echo
    cat src/sandbox-workbench.js
  fi
} > "$OUT"

node --check "$OUT"
echo "construit : $OUT ($(wc -l < "$OUT") lignes)"
