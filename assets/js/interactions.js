/* ============================================================
 * interactions.js — les manipulations pédagogiques
 * - widget staging : « que va contenir mon prochain commit ? »
 * - widget commit ≠ push : Marie commite, Franck regarde GitLab
 * - widget tag : un commit ordinaire devient un jalon officiel
 * - checkpoints : questions à choix avec explication
 * Sans JavaScript, chaque widget affiche un état statique déjà
 * compréhensible ; les boutons deviennent simplement inertes.
 * ============================================================ */
(function () {
  "use strict";

  // --- Widget staging -----------------------------------------
  var sw = document.getElementById("staging-widget");
  if (sw) {
    var files = sw.querySelectorAll(".sw-file");
    var stageList = sw.querySelector(".sw-stage__list");
    var stageEmpty = sw.querySelector(".sw-stage__empty");
    var previewList = sw.querySelector(".sw-preview-list");

    var render = function () {
      var staged = [];
      files.forEach(function (f) {
        if (f.classList.contains("is-staged")) staged.push(f.getAttribute("data-file"));
      });

      stageList.innerHTML = "";
      staged.forEach(function (name) {
        var chip = document.createElement("span");
        chip.className = "file-chip is-staged";
        chip.textContent = name;
        stageList.appendChild(chip);
      });
      stageEmpty.hidden = staged.length > 0;

      previewList.innerHTML = "";
      if (!staged.length) {
        var li = document.createElement("li");
        li.className = "sw-empty";
        li.textContent = "Rien : la zone de préparation est vide. Le commit serait refusé.";
        previewList.appendChild(li);
      } else {
        staged.forEach(function (name) {
          var li = document.createElement("li");
          li.textContent = name;
          previewList.appendChild(li);
        });
      }
    };

    files.forEach(function (f) {
      f.addEventListener("click", function () {
        var staged = f.classList.toggle("is-staged");
        f.setAttribute("aria-pressed", staged ? "true" : "false");
        var state = f.querySelector(".sw-file__state");
        if (state) state.textContent = staged ? "prêt ✓" : "modifié";
        render();
      });
    });

    sw.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-action]");
      if (!btn) return;
      var action = btn.getAttribute("data-action");
      if (action === "add-all" || action === "reset") {
        files.forEach(function (f) {
          f.classList.toggle("is-staged", action === "add-all");
          f.setAttribute("aria-pressed", action === "add-all" ? "true" : "false");
          var state = f.querySelector(".sw-file__state");
          if (state) state.textContent = action === "add-all" ? "prêt ✓" : "modifié";
        });
        render();
      }
    });

    render();
  }

  // --- Widget commit ≠ push -------------------------------------
  var pw = document.getElementById("push-widget");
  if (pw) {
    var localList = pw.querySelector(".pw-local-list");
    var remoteList = pw.querySelector(".pw-remote-list");
    var hint = pw.querySelector('[data-role="hint"]');
    var commitBtn = pw.querySelector('[data-action="commit"]');
    var pushBtn = pw.querySelector('[data-action="push"]');
    var resetBtn = pw.querySelector('[data-action="reset"]');

    var pending = [];
    var queue = [
      { h: "8f31c2a", msg: "Modifie le calcul de l'indicateur" },
      { h: "c47d1e9", msg: "Ajoute la ventilation par sexe" },
      { h: "e02ab55", msg: "Corrige le seuil de population" }
    ];
    var initialLocal = localList.innerHTML;
    var initialRemote = remoteList.innerHTML;
    var step = 0;

    var setHint = function (html) { if (hint) hint.innerHTML = html; };

    if (commitBtn) commitBtn.addEventListener("click", function () {
      if (step >= queue.length) return;
      var c = queue[step++];
      var el = document.createElement("div");
      el.className = "pw-commit pw-commit--new pw-flying";
      el.textContent = c.h + " " + c.msg;
      localList.appendChild(el);
      pending.push(c);
      pushBtn.disabled = false;
      setHint(
        "Le commit existe… <strong>mais seulement sur le poste de Marie</strong>. " +
        "Franck actualise GitLab : il ne voit toujours rien. Pourquoi ?"
      );
      if (step >= queue.length) commitBtn.disabled = true;
    });

    if (pushBtn) pushBtn.addEventListener("click", function () {
      if (!pending.length) return;
      var news = localList.querySelectorAll(".pw-commit--new");
      news.forEach(function (el, i) {
        el.classList.remove("pw-commit--new");
        var clone = el.cloneNode(true);
        clone.classList.add("pw-flying");
        clone.style.animationDelay = i * 120 + "ms";
        remoteList.appendChild(clone);
      });
      pending = [];
      pushBtn.disabled = true;
      setHint(
        "<strong>git push</strong> a envoyé les commits vers GitLab. " +
        "Cette fois, Franck voit le travail de Marie. Commit = enregistrer chez soi ; push = partager."
      );
    });

    if (resetBtn) resetBtn.addEventListener("click", function () {
      localList.innerHTML = initialLocal;
      remoteList.innerHTML = initialRemote;
      pending = [];
      step = 0;
      commitBtn.disabled = false;
      pushBtn.disabled = true;
      setHint("Marie vient de finir sa modification. À vous : commencez par <code>git commit</code>.");
    });
  }

  // --- Widget tag : un commit devient un jalon -------------------
  document.querySelectorAll('[data-widget="tag"]').forEach(function (w) {
    var btn = w.querySelector("[data-tag-button]");
    var target = w.querySelector("[data-tag-target]");
    var name = w.getAttribute("data-tag-name") || "livraison-2026-v1";
    if (!btn || !target) return;

    // Région de statut déclarée dès le départ : la révélation de la
    // confirmation sera annoncée par les lecteurs d'écran.
    var done = w.querySelector("[data-tag-done]");
    if (done) done.setAttribute("role", "status");

    btn.addEventListener("click", function () {
      if (target.classList.contains("tl-tag")) return;
      target.classList.add("tl-tag");
      var pill = document.createElement("span");
      pill.className = "tl-tagname";
      pill.textContent = "◆ " + name;
      var msg = target.querySelector(".tl-msg");
      (msg || target).appendChild(pill);
      btn.disabled = true;
      btn.textContent = "Jalon posé ✓";
      if (done) done.hidden = false;
    });
  });

  // --- Checkpoints à choix ---------------------------------------
  document.querySelectorAll("[data-quiz]").forEach(function (quiz) {
    var explain = quiz.querySelector(".quiz-explain");
    quiz.querySelectorAll(".quiz-opt").forEach(function (opt) {
      opt.addEventListener("click", function () {
        var right = opt.hasAttribute("data-right");
        if (right) {
          quiz.querySelectorAll(".quiz-opt").forEach(function (o) {
            o.classList.remove("is-wrong");
            o.disabled = true;
          });
          opt.classList.add("is-right");
          if (explain) explain.hidden = false;
        } else {
          opt.classList.add("is-wrong");
        }
      });
    });
  });
})();
