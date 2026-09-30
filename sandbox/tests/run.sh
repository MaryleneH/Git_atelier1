#!/usr/bin/env bash
# Lance toutes les suites de tests du bac à sable.
#
#   cd sandbox && npm ci && bash tests/run.sh
#
# 1. test-core   le moteur Git (sans DOM)
# 2. test-when   le mini-langage des tâches `when:`
# 3. test-ui     terminal et schéma des zones, au niveau du DOM (jsdom)
# D'autres suites s'ajoutent ici quand elles existent.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
for t in tests/test-*.js; do
  printf '\n--- %s\n' "$(basename "$t")"
  node "$t" | tail -6 || fail=1
  node "$t" > /dev/null 2>&1 || fail=1
done

echo
if [ "$fail" -eq 0 ]; then echo "Toutes les suites passent."; else echo "Des suites échouent."; exit 1; fi
