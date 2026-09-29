/* ============================================================
 * animations.js — apparitions au scroll
 * Un seul IntersectionObserver pose .is-visible sur les
 * éléments porteurs de [data-animate]. Le CSS fait le reste.
 * Respecte prefers-reduced-motion : dans ce cas, tout est
 * rendu visible immédiatement, sans transition.
 * ============================================================ */
(function () {
  "use strict";

  var targets = document.querySelectorAll("[data-animate]");
  if (!targets.length) return;

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduced || !("IntersectionObserver" in window)) {
    targets.forEach(function (el) { el.classList.add("is-visible"); });
    return;
  }

  var observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
  );

  targets.forEach(function (el) { observer.observe(el); });
})();
