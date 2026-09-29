/* ============================================================
 * terminal.js — habillage des blocs .terminal-demo
 * - ajoute la barre de titre (pastilles, nom, bouton copier)
 * - distingue la commande (1er bloc) de la sortie (suivants)
 * - colore sémantiquement les lignes de sortie
 * - révèle la sortie ligne à ligne à l'entrée dans l'écran
 * Le contenu reste du texte réel : sélectionnable, copiable,
 * lisible sans JavaScript.
 * ============================================================ */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function classifyLine(text) {
    var t = text;
    // En-têtes de diff : les noms de fichiers (--- a/…, +++ b/…) sont du
    // texte principal ; les repères de position (@@ … @@) des métadonnées.
    if (/^(---|\+\+\+)\s/.test(t)) return "t-bold";
    if (/^@@/.test(t)) return "t-meta";
    if (/^\+(?!\+\+)/.test(t)) return "t-green";
    if (/^-(?!--)/.test(t)) return "t-red";
    if (/(modifi[ée]\s?:|modified:|nouveau fichier\s?:|new file:)/i.test(t)) return "t-yellow";
    if (/^(Sur la branche|On branch|commit |tag |Auteur|Author|Date)/.test(t)) return "t-bold";
    return "";
  }

  document.querySelectorAll(".terminal-demo").forEach(function (term) {
    var blocks = term.querySelectorAll("pre");
    if (!blocks.length) return;

    // 1er bloc = commande(s), les suivants = sortie
    blocks.forEach(function (pre, i) {
      var holder = pre.closest("div.sourceCode") || pre;
      holder.classList.add(i === 0 ? "term-cmd" : "term-out");
    });

    // Barre de titre
    var bar = document.createElement("div");
    bar.className = "term-bar";
    var title = term.getAttribute("data-title") || "terminal";
    bar.innerHTML =
      '<span class="term-dots" aria-hidden="true"><span></span><span></span><span></span></span>' +
      '<span class="term-title">' + title + "</span>";

    // Bouton copier (copie uniquement la commande)
    var cmdCode = blocks[0].querySelector("code");
    if (cmdCode && navigator.clipboard) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "term-copy";
      btn.textContent = "Copier";
      btn.setAttribute("aria-label", "Copier la commande");
      btn.addEventListener("click", function () {
        navigator.clipboard.writeText(cmdCode.textContent.trim()).then(function () {
          btn.textContent = "Copié ✓";
          btn.classList.add("is-copied");
          setTimeout(function () {
            btn.textContent = "Copier";
            btn.classList.remove("is-copied");
          }, 1800);
        });
      });
      bar.appendChild(btn);
    }
    term.insertBefore(bar, term.firstChild);

    // Coloration + découpe en lignes des sorties
    // data-highlight="préfixe" sur .terminal-demo : la ligne de sortie qui
    // commence par ce préfixe (ex. un identifiant de commit) est mise en
    // évidence — mécanisme générique, le contenu reste dans la page.
    var highlight = term.getAttribute("data-highlight");
    term.querySelectorAll(".term-out").forEach(function (out) {
      var code = out.querySelector("code");
      if (!code || code.querySelector(".t-line")) return;
      var lines = code.textContent.replace(/\n$/, "").split("\n");
      code.textContent = "";
      lines.forEach(function (line, idx) {
        var span = document.createElement("span");
        span.className = ("t-line " + classifyLine(line)).trim();
        if (highlight && line.indexOf(highlight) === 0) span.className = "t-line t-hl";
        span.textContent = line === "" ? " " : line;
        if (!reduced) span.style.transitionDelay = Math.min(idx * 70, 900) + "ms";
        code.appendChild(span);
      });
    });

    // Révélation progressive au scroll
    if (!reduced && "IntersectionObserver" in window && term.querySelector(".term-out")) {
      term.setAttribute("data-animated", "");
      var obs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              term.classList.add("is-visible");
              obs.disconnect();
            }
          });
        },
        { threshold: 0.35 }
      );
      obs.observe(term);
    } else {
      term.classList.add("is-visible");
    }
  });
})();
