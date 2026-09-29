/* ============================================================
 * home-graph.js — scénographie Git de l'accueil
 * Deux décors, chacun défini dans un <template> présent
 * uniquement sur la homepage :
 *  - #home-gitgraph-tpl : l'historique du bandeau latéral
 *    gauche, injecté dans la sidebar (desktop ≥ 992 px) ;
 *  - #home-ribbon-tpl : le ruban narratif de la marge droite
 *    (rivière de commits / constellation), injecté en fin de
 *    body (grand desktop ≥ 1340 px, là où la colonne droite
 *    existe réellement).
 * Purement décoratif : aria-hidden, aucun événement, aucune
 * information pédagogique ne dépend de ces motifs. Les
 * animations d'apparition sont entièrement en CSS, donc
 * neutralisées par prefers-reduced-motion comme le reste.
 * ============================================================ */
(function () {
  "use strict";

  // --- Bandeau latéral gauche ----------------------------------
  var tpl = document.getElementById("home-gitgraph-tpl");
  var sidebar = document.getElementById("quarto-sidebar");
  if (tpl && sidebar && "content" in tpl &&
      window.matchMedia("(min-width: 992px)").matches) {
    var art = tpl.content.firstElementChild;
    if (art) {
      sidebar.classList.add("gg-host");
      sidebar.insertBefore(art.cloneNode(true), sidebar.firstChild);
    }
  }

  // --- Ruban narratif de la marge droite -------------------------
  var rbTpl = document.getElementById("home-ribbon-tpl");
  if (rbTpl && "content" in rbTpl &&
      window.matchMedia("(min-width: 1340px)").matches) {
    var ribbon = rbTpl.content.firstElementChild;
    if (ribbon) document.body.appendChild(ribbon.cloneNode(true));
  }
})();
