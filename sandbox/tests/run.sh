#!/usr/bin/env bash
# Lance toutes les suites de tests du bac à sable.
#
#   cd sandbox && npm ci && bash tests/run.sh
#
# 1. test-core   le moteur Git (sans DOM)
# 2. test-when   le mini-langage des tâches `when:`
# 3. test-ui     terminal et schéma des zones, au niveau du DOM (jsdom)
# 4. test-atelier le moteur et les missions du bac à sable, en R et en Python
# 5. test-fidelite les sorties comparées à celles du vrai git
# Le parcours dans un navigateur (e2e-bac-a-sable.js) se lance à part.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
for t in tests/test-*.js; do
  printf '\n--- %s\n' "$(basename "$t")"
  out=$(node "$t" 2>&1); status=$?
  printf '%s\n' "$out" | tail -6
  [ "$status" -eq 0 ] || fail=1
done

echo
if [ "$fail" -eq 0 ]; then echo "Toutes les suites passent."; else echo "Des suites échouent."; exit 1; fi
