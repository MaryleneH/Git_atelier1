/* ============================================================
 * progress.js — progression de la journée
 * - barre de lecture fine en haut de page
 * - pastilles numérotées dans la sidebar (parcours du jour)
 * - jauge "Étape X / 9" en tête de sidebar
 * Purement décoratif et informatif : la navigation Quarto
 * fonctionne intégralement sans ce script.
 * ============================================================ */
(function () {
  "use strict";

  // --- Barre de lecture ---------------------------------------
  var bar = document.createElement("div");
  bar.className = "gsd-readbar";
  bar.setAttribute("aria-hidden", "true");
  document.body.appendChild(bar);

  var ticking = false;
  function updateBar() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
    bar.style.width = ratio * 100 + "%";
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(updateBar);
    }
  }, { passive: true });
  updateBar();

  // --- Parcours dans la sidebar ---------------------------------
  var sidebar = document.getElementById("quarto-sidebar");
  if (!sidebar) return;

  var links = Array.prototype.slice.call(
    sidebar.querySelectorAll('a.sidebar-item-text, .sidebar-item a')
  );

  var stepLinks = [];
  links.forEach(function (a) {
    var href = a.getAttribute("href") || "";
    var m = href.match(/(\d{2})-[a-z0-9-]+\.html/);
    if (m && !a.querySelector(".gsd-step-dot")) {
      var num = parseInt(m[1], 10);
      var dot = document.createElement("span");
      dot.className = "gsd-step-dot";
      dot.setAttribute("aria-hidden", "true");
      dot.textContent = m[1];
      a.insertBefore(dot, a.firstChild);
      stepLinks.push({ a: a, num: num });
    }
  });

  if (!stepLinks.length) return;

  var current = 0;
  stepLinks.forEach(function (s) {
    if (s.a.classList.contains("active")) current = s.num;
  });

  stepLinks.forEach(function (s) {
    if (current > 0 && s.num < current) {
      s.a.classList.add("gsd-step-done");
      var dot = s.a.querySelector(".gsd-step-dot");
      if (dot) dot.textContent = "✓";
    }
  });

  // Jauge du jour
  var total = stepLinks.length;
  if (current > 0) {
    var gauge = document.createElement("div");
    gauge.className = "gsd-day-progress";
    gauge.innerHTML =
      '<div class="gsd-day-progress__label"><span>Le parcours du jour</span>' +
      "<span>" + current + " / " + total + "</span></div>" +
      '<div class="gsd-day-progress__track" role="img" aria-label="Étape ' +
      current + " sur " + total + '">' +
      '<div class="gsd-day-progress__fill" style="width:' +
      Math.round((current / total) * 100) + '%"></div></div>';
    var menu = sidebar.querySelector(".sidebar-menu-container");
    if (menu) menu.insertBefore(gauge, menu.firstChild);
  }
})();
