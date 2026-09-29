/* ============================================================
 * films.js — mini-films pédagogiques
 * Les <video> sont livrés sans src (data-src) et masqués.
 * - data-src relatif (fichier du dépôt) : une sonde HEAD vérifie
 *   que le fichier existe — tant qu'il est absent, aucun lecteur
 *   cassé et aucune requête inutile, le placeholder reste affiché.
 * - data-src absolu (https://…, film hébergé hors du site, S3…) :
 *   activation directe, sans sonde — un fetch HEAD cross-origin
 *   dépendrait de la politique CORS du serveur, alors que la
 *   lecture par la balise <video> n'en a pas besoin.
 * Quand le film est disponible, le bouton s'active : lecture
 * volontaire uniquement (pas d'autoplay), une seule vidéo à la
 * fois. Sans JavaScript, le placeholder statique suffit : tout le
 * contenu pédagogique est dans le texte.
 * ============================================================ */
(function () {
  "use strict";

  var films = document.querySelectorAll(".learning-film");
  if (!films.length || typeof fetch !== "function") return;

  var videos = [];

  films.forEach(function (film) {
    var video = film.querySelector(".learning-film__video");
    var btn = film.querySelector(".learning-film__placeholder");
    var status = film.querySelector('[data-role="status"]');
    if (!video || !btn) return;

    var src = video.getAttribute("data-src");
    if (!src) return;

    function activate() {
      video.src = src;
      var poster = video.getAttribute("data-poster");
      if (poster) {
        fetch(poster, { method: "HEAD" })
          .then(function (p) { if (p.ok) video.poster = poster; })
          .catch(function () {});
      }

      film.classList.add("is-ready");
      btn.disabled = false;
      if (status) status.textContent = "Lancer le mini-film";
      videos.push(video);

      btn.addEventListener("click", function () {
        btn.hidden = true;
        video.hidden = false;
        var playing = video.play();
        if (playing && playing.catch) playing.catch(function () {});
        video.focus();
      });

      // Jamais deux mini-films en même temps
      video.addEventListener("play", function () {
        videos.forEach(function (other) {
          if (other !== video && !other.paused) other.pause();
        });
      });
    }

    if (/^https?:\/\//i.test(src)) {
      activate();
      return;
    }

    fetch(src, { method: "HEAD" })
      .then(function (res) {
        if (res.ok) activate();
      })
      .catch(function () {
        // Fichier absent ou hors ligne : le placeholder reste tel quel.
      });
  });
})();
