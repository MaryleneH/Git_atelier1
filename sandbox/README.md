# Sources du bac à sable

Fork local de [quarto-git-sandbox](https://github.com/ryjohnson09/quarto-git-sandbox)
(Ryan Johnson, licence MIT, version 1.1.0), adapté pour le bac à sable de l'atelier.

| Chemin | Rôle |
|---|---|
| `src/sandbox-core.js` | Le moteur : filesystem en mémoire + vrai Git (isomorphic-git) |
| `src/sandbox-when.js` | Le mini-langage des tâches `when:` |
| `src/sandbox-ui.js` | Les exercices `git-sandbox` (terminal, trois zones, historique) |
| `src/sandbox-workbench.js` | L'atelier : explorateur, éditeur, terminal, zones, missions |
| `build.sh` | Reconstruit `_extensions/git-sandbox/resources/git-sandbox.js` |
| `tests/` | Tests du moteur (Node), de l'interface (jsdom), fidélité au vrai Git, parcours de bout en bout (Chromium) |

Le fichier `_extensions/git-sandbox/resources/git-sandbox.js` est **généré** :
on modifie `src/`, puis on relance le build et les tests.

```bash
cd sandbox
npm ci              # une fois : isomorphic-git et jsdom pour les tests
bash build.sh       # régénère le fichier de l'extension
bash tests/run.sh   # toutes les suites Node (moteur, missions, fidélité au vrai Git, interface)
```

Le parcours complet, dans un vrai navigateur (Playwright), sur le site rendu :

```bash
quarto render && (cd _site && python3 -m http.server 8765 &)
node sandbox/tests/e2e-bac-a-sable.js http://localhost:8765/bac-a-sable.html
```
