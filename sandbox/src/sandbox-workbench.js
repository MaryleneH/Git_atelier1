/* ------------------------------------------------------------------
   git sandbox workbench: a small project environment in the page.

     explorer · editor · terminal · three zones · guided missions

   The editor and the terminal share ONE sandbox (sandbox-core.js): saving
   a file writes to the same in-memory filesystem that `git status` reads,
   and `git restore` changes what the editor shows. There is no second git.

   The page provides the project and the missions:

     GitSandboxWorkbench.mount('#atelier', {
       project: 'entreprises_defense',
       languages: [{ id: 'R', label: 'R' }, { id: 'Python', label: 'Python' }],
       fileFor: function (lang, name) { ... },   // '02_nettoyage' -> path
       swapLang: function (text, lang) { ... },  // adapt mission texts
       readOnly: function (path) { ... },
       missions: { id: { seed, open, checks: { key: async (ctx) => bool } } },
       storageKey: 'atelier1-bac:v1'
     });

   Mission texts are authored in the page as `.gw-mission` blocks inside
   the host element; this file only animates them.
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var UI = root.GitSandboxUI || {};
  var esc = UI.esc || function (s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var markup = UI.markup || esc;

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function basename(p) { return p.slice(p.lastIndexOf('/') + 1); }

  /* ------------------------------------------------------------------
     The line that tells the versions apart: first line where the texts
     of the three zones differ. For a one-line edit this is exactly the
     edited line, so the diagram reads "0.15 | 0.10 | 0.20".
     ------------------------------------------------------------------ */
  function keyLine(texts) {
    var arrays = texts.map(function (t) { return t === null ? null : t.replace(/\n$/, '').split('\n'); });
    var present = arrays.filter(function (a) { return a !== null; });
    if (present.length < 2) return -1;
    var max = Math.max.apply(null, present.map(function (a) { return a.length; }));
    for (var i = 0; i < max; i++) {
      var first = present[0][i];
      for (var k = 1; k < present.length; k++) {
        if (present[k][i] !== first) return i;
      }
    }
    return -1;
  }

  function snippetOf(text, line) {
    if (text === null || line < 0) return null;
    var l = text.replace(/\n$/, '').split('\n')[line];
    if (l === undefined) return '(ligne absente)';
    l = l.trim();
    if (l === '') return '(ligne vide)';
    return l.length > 46 ? l.slice(0, 45) + '…' : l;
  }

  /* ------------------------------ storage ----------------------------- */

  function loadState(key) {
    try { return JSON.parse(root.localStorage.getItem(key) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveState(key, state) {
    try { root.localStorage.setItem(key, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  /* ------------------------------- mount ------------------------------ */

  function mount(selector, cfg) {
    var host = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!host) return null;
    cfg = cfg || {};

    if (!root.git || !root.GitSandboxCore || typeof root.Buffer === 'undefined') {
      host.insertAdjacentHTML('afterbegin',
        '<div class="gw-fail">Le bac à sable n\'a pas pu démarrer : la bibliothèque Git ne s\'est pas chargée.</div>');
      return null;
    }

    var languages = cfg.languages || [{ id: 'R', label: 'R' }];
    var storageKey = cfg.storageKey || 'git-workbench';
    var saved = loadState(storageKey);
    var lang = languages.some(function (l) { return l.id === saved.lang; }) ? saved.lang : languages[0].id;
    var completed = saved.done || {};

    // Missions authored in the page
    var missions = Array.prototype.map.call(host.querySelectorAll('.gw-mission'), function (node) {
      var id = node.getAttribute('data-mission');
      var h = node.querySelector('h2, h3');
      return {
        id: id,
        node: node,
        def: (cfg.missions || {})[id] || {},
        short: node.getAttribute('data-short') || (h ? h.textContent : id),
        kind: node.getAttribute('data-kind') || '',
        duration: node.getAttribute('data-duration') || ''
      };
    }).filter(function (m) { return m.def && m.def.seed; });
    if (!missions.length) return null;
    missions.forEach(function (m) { m.node.parentNode.removeChild(m.node); });

    var current = Math.max(0, missions.map(function (m) { return m.id; }).indexOf(saved.mission));

    var sb = root.GitSandboxCore.createSandbox({
      git: root.git,
      displayDir: '~/' + (cfg.project || 'projet')
    });

    /* --------------------------- skeleton ---------------------------- */

    var uid = host.id || 'gw';
    host.classList.add('gw');
    host.insertAdjacentHTML('beforeend',
      '<div class="gw-bar">' +
        '<div class="gw-proj"><span class="gw-proj-mark" aria-hidden="true"></span>' +
          '<span>Projet&nbsp;: <strong>' + esc(cfg.project || 'projet') + '</strong></span></div>' +
        '<div class="gw-lang" role="radiogroup" aria-label="Votre langage habituel">' +
          '<span class="gw-lang-label" aria-hidden="true">Votre langage</span>' +
          languages.map(function (l) {
            return '<button type="button" role="radio" class="gw-lang-btn" data-lang="' + esc(l.id) + '">' + esc(l.label) + '</button>';
          }).join('') +
        '</div>' +
        '<div class="gw-actions">' +
          '<button type="button" class="gw-btn gw-undo" disabled>Annuler la dernière action</button>' +
          '<button type="button" class="gw-btn gw-restart">Recommencer la mission</button>' +
        '</div>' +
      '</div>' +
      '<nav class="gw-steps" aria-label="Parcours"><ol></ol></nav>' +
      '<div class="gw-layout">' +
        '<section class="gw-mission-panel" aria-label="Mission en cours"></section>' +
        '<div class="gw-work" data-mtab="editor">' +
          '<div class="gw-mtabs" role="tablist" aria-label="Espace de travail">' +
            '<button type="button" role="tab" data-mtab="files">Fichiers</button>' +
            '<button type="button" role="tab" data-mtab="editor">Éditeur</button>' +
            '<button type="button" role="tab" data-mtab="terminal">Terminal</button>' +
            '<button type="button" role="tab" data-mtab="zones">Git</button>' +
          '</div>' +
          '<div class="gw-top">' +
            '<nav class="gw-explorer" data-panel="files" aria-label="Explorateur de fichiers">' +
              '<div class="gw-pane-h">Explorateur</div>' +
              '<ul class="gw-tree" role="list"></ul>' +
              '<p class="gw-legend"><span><b class="gw-tag gw-tag-m">M</b> modifié</span> ' +
                '<span><b class="gw-tag gw-tag-s">S</b> sélectionné</span> ' +
                '<span><b class="gw-tag gw-tag-u">U</b> non suivi</span> ' +
                '<span><b class="gw-tag gw-tag-i">I</b> ignoré</span> ' +
                '<span><b class="gw-dirty-dot">●</b> non enregistré</span></p>' +
            '</nav>' +
            '<section class="gw-editor" data-panel="editor" aria-label="Éditeur">' +
              '<div class="gw-ed-head">' +
                '<span class="gw-ed-path">Aucun fichier ouvert</span>' +
                '<span class="gw-ed-state"></span>' +
                '<button type="button" class="gw-btn gw-save" disabled>Enregistrer <kbd>Ctrl+S</kbd></button>' +
              '</div>' +
              '<div class="gw-ed-notice" hidden></div>' +
              '<div class="gw-ed-body">' +
                '<pre class="gw-gutter" aria-hidden="true"></pre>' +
                '<textarea class="gw-text" id="' + uid + '-text" spellcheck="false" autocapitalize="off" autocorrect="off" wrap="off" disabled></textarea>' +
              '</div>' +
              '<div class="gw-ed-foot">Enregistrer&nbsp;: <kbd>Ctrl</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>S</kbd> sur Mac) · <kbd>Tab</kbd>&nbsp;: indenter · <kbd>Échap</kbd> puis <kbd>Tab</kbd>&nbsp;: sortir de l\'éditeur</div>' +
            '</section>' +
          '</div>' +
          '<section class="gw-terminal" data-panel="terminal" aria-label="Terminal Git">' +
            '<div class="gw-pane-h">Terminal</div>' +
            '<div class="gw-out" role="log" aria-label="Sortie du terminal" tabindex="0"></div>' +
            '<form class="gw-in" autocomplete="off">' +
              '<label class="gw-prompt" for="' + uid + '-cmd"></label>' +
              '<input class="gw-cmd" id="' + uid + '-cmd" type="text" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="tapez une commande, puis Entrée">' +
            '</form>' +
          '</section>' +
          '<section class="gw-zones" data-panel="zones" aria-label="Les trois zones de Git"></section>' +
        '</div>' +
      '</div>' +
      '<div class="gw-live" aria-live="polite" role="status"></div>');

    var q = function (s) { return host.querySelector(s); };
    var stepsList = q('.gw-steps ol');
    var panel = q('.gw-mission-panel');
    var work = q('.gw-work');
    var tree = q('.gw-tree');
    var edPath = q('.gw-ed-path');
    var edState = q('.gw-ed-state');
    var edNotice = q('.gw-ed-notice');
    var saveBtn = q('.gw-save');
    var gutter = q('.gw-gutter');
    var text = q('.gw-text');
    var out = q('.gw-out');
    var form = q('.gw-in');
    var cmd = q('.gw-cmd');
    var promptEl = q('.gw-prompt');
    var zones = q('.gw-zones');
    var live = q('.gw-live');
    var undoBtn = q('.gw-undo');
    var restartBtn = q('.gw-restart');

    /* ----------------------------- state ----------------------------- */

    var buffers = {};      // path -> { text, base, dirty }
    var openPath = null;
    var events = [];       // { type: 'cmd'|'save'|'open'|'answer', ... }
    var cmdHistory = [], histIdx = 0;
    var undoStack = [];
    var UNDO_DEPTH = 30;
    var checks = {};       // key -> true once ticked
    var answers = {};
    var startOid = null;
    var busy = false;
    var lastModel = null;

    function mission() { return missions[current]; }
    function persist() { saveState(storageKey, { lang: lang, mission: mission().id, done: completed }); }

    function announce(msg) {
      live.textContent = '';
      // a fresh text node is read even when the message repeats
      setTimeout(function () { live.textContent = msg; }, 30);
    }

    /* --------------------------- terminal ---------------------------- */

    function write(html, cls) {
      out.appendChild(el('div', 'gw-line' + (cls ? ' ' + cls : ''), html));
      out.scrollTop = out.scrollHeight;
    }
    function writeText(t, cls) {
      if (t === '' || t == null) return;
      write(markup(t), cls);
    }
    // Welcome message (cfg.welcome, an array of lines with {y}…{/} marks),
    // written above the intro each time a mission starts or restarts.
    // cfg.welcomeIcon, optional, is a small decorative SVG shown in the
    // block's left margin.
    function writeWelcome(lines) {
      var box = el('div', 'gw-welcome' + (cfg.welcomeIcon ? ' gw-welcome-has-icon' : ''));
      box.setAttribute('role', 'note');
      box.setAttribute('aria-label', 'Message d\'accueil');
      if (cfg.welcomeIcon) {
        var icon = el('span', 'gw-welcome-icon', cfg.welcomeIcon);
        icon.setAttribute('aria-hidden', 'true');
        box.appendChild(icon);
      }
      lines.forEach(function (l, i) {
        box.appendChild(el('div', 'gw-line' + (i === 0 ? ' gw-welcome-title' : '') + (l === '' ? ' gw-blank' : ''),
          l === '' ? '' : markup(l)));
      });
      out.appendChild(box);
    }

    function promptText() {
      var br = lastModel && lastModel.branch;
      return '~/' + (cfg.project || 'projet') + (br ? ' (' + br + ')' : '') + ' $';
    }

    /* ------------------------------ undo ----------------------------- */

    function cloneBuffers() {
      var c = {};
      Object.keys(buffers).forEach(function (k) { c[k] = { text: buffers[k].text, base: buffers[k].base, dirty: buffers[k].dirty }; });
      return c;
    }
    function capture(label) {
      return {
        label: label,
        core: sb.snapshot(),
        buffers: cloneBuffers(),
        openPath: openPath,
        outHtml: out.innerHTML,
        events: events.length,
        cmdHistory: cmdHistory.length,
        checks: JSON.parse(JSON.stringify(checks)),
        answers: JSON.parse(JSON.stringify(answers))
      };
    }
    function pushUndo(entry) {
      undoStack.push(entry);
      if (undoStack.length > UNDO_DEPTH) undoStack.shift();
    }
    async function doUndo() {
      var e = undoStack.pop();
      if (!e) { writeText('Rien à annuler.'); return; }
      sb.restore(e.core);
      buffers = e.buffers;
      openPath = e.openPath;
      out.innerHTML = e.outHtml;
      events.length = e.events;
      cmdHistory.length = e.cmdHistory;
      histIdx = cmdHistory.length;
      checks = e.checks;
      answers = e.answers;
      writeText('{y}Annulé :{/} ' + e.label, 'gw-note');
      showBuffer();
      await refresh({ skipChecks: true });
      renderMissionState();
      announce('Action annulée : ' + e.label);
    }

    /* ----------------------------- editor ---------------------------- */

    function isReadOnly(p) { return !!(cfg.readOnly && cfg.readOnly(p)); }

    function syncGutter() {
      var n = text.value.split('\n').length;
      var s = '';
      for (var i = 1; i <= n; i++) s += i + '\n';
      gutter.textContent = s;
      gutter.scrollTop = text.scrollTop;
    }

    function renderEditorHead() {
      if (!openPath) {
        edPath.textContent = 'Aucun fichier ouvert';
        edState.textContent = '';
        edState.className = 'gw-ed-state';
        saveBtn.disabled = true;
        return;
      }
      var b = buffers[openPath];
      edPath.textContent = openPath;
      if (isReadOnly(openPath)) {
        edState.textContent = 'Lecture seule';
        edState.className = 'gw-ed-state gw-ed-ro';
      } else if (b && b.dirty) {
        edState.textContent = '● Modifié, non enregistré';
        edState.className = 'gw-ed-state gw-ed-dirty';
      } else {
        edState.textContent = 'Enregistré';
        edState.className = 'gw-ed-state gw-ed-clean';
      }
      saveBtn.disabled = !(b && b.dirty) || isReadOnly(openPath);
    }

    // Put the open buffer back on screen (after Annuler, which restores the
    // buffers as they were).
    function showBuffer() {
      if (!openPath || !buffers[openPath]) {
        openPath = null;
        text.value = '';
        text.disabled = true;
      } else {
        text.disabled = false;
        text.readOnly = isReadOnly(openPath);
        text.value = buffers[openPath].text;
        text.setAttribute('aria-label', 'Contenu de ' + openPath);
      }
      syncGutter();
      renderEditorHead();
      renderNotice();
    }

    async function openFile(p, opts) {
      opts = opts || {};
      if (!buffers[p]) {
        var content = '';
        try { content = await sb.readFile(p); } catch (e) { return; }
        buffers[p] = { text: content, base: content, dirty: false };
      }
      openPath = p;
      text.disabled = false;
      text.readOnly = isReadOnly(p);
      text.value = buffers[p].text;
      text.setAttribute('aria-label', 'Contenu de ' + p);
      text.scrollTop = 0;
      syncGutter();
      renderEditorHead();
      renderNotice();
      renderTree();
      if (!opts.silent) {
        events.push({ type: 'open', file: p });
        if (opts.focus !== false) {
          setMobileTab('editor');
          text.focus();
          text.setSelectionRange(0, 0);
        }
        await evaluate();
      }
    }

    function renderNotice() {
      var b = openPath && buffers[openPath];
      if (openPath && isReadOnly(openPath)) {
        edNotice.hidden = false;
        edNotice.className = 'gw-ed-notice gw-ed-notice-ro';
        edNotice.innerHTML = (cfg.readOnlyNote && cfg.readOnlyNote(openPath)) || 'Ce fichier est en lecture seule dans le bac à sable.';
      } else if (b && b.dirty && b.stale) {
        edNotice.hidden = false;
        edNotice.className = 'gw-ed-notice gw-ed-notice-warn';
        edNotice.innerHTML = 'Ce fichier a changé sur le disque (une commande Git l\'a modifié), mais vos modifications ne sont pas enregistrées. ' +
          '<button type="button" class="gw-btn gw-reload">Recharger la version du disque</button>';
        edNotice.querySelector('.gw-reload').addEventListener('click', async function () {
          var fresh = '';
          try { fresh = await sb.readFile(openPath); } catch (e) {}
          buffers[openPath] = { text: fresh, base: fresh, dirty: false };
          await openFile(openPath, { silent: true });
          await refresh();
        });
      } else {
        edNotice.hidden = true;
        edNotice.innerHTML = '';
      }
    }

    async function save() {
      if (!openPath || isReadOnly(openPath)) return;
      var b = buffers[openPath];
      if (!b || !b.dirty) return;
      if (busy) return;
      busy = true;
      var entry = capture('enregistrement de ' + openPath);
      await sb.writeFile(openPath, b.text);
      b.base = b.text;
      b.dirty = false;
      b.stale = false;
      pushUndo(entry);
      events.push({ type: 'save', file: openPath });
      renderEditorHead();
      renderNotice();
      announce(basename(openPath) + ' enregistré.');
      busy = false;
      await refresh();
    }

    text.addEventListener('input', function () {
      if (!openPath) return;
      var b = buffers[openPath];
      b.text = text.value;
      b.dirty = b.text !== b.base;
      syncGutter();
      renderEditorHead();
      renderTree();
      renderZones();
    });
    text.addEventListener('scroll', function () { gutter.scrollTop = text.scrollTop; });

    var escArmed = false;
    text.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { escArmed = true; return; }
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && !escArmed && !text.readOnly) {
        e.preventDefault();
        var s = text.selectionStart, end = text.selectionEnd;
        text.value = text.value.slice(0, s) + '  ' + text.value.slice(end);
        text.selectionStart = text.selectionEnd = s + 2;
        text.dispatchEvent(new Event('input'));
        return;
      }
      escArmed = false;
    });
    saveBtn.addEventListener('click', function () { save(); });

    // Ctrl+S / Cmd+S anywhere in the workbench saves the open file
    host.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        save();
      }
    });

    /* ---------------------------- explorer --------------------------- */

    var collapsed = {};

    function fileTags(p) {
      var m = lastModel;
      var tags = [];
      if (!m) return tags;
      var r = m.rowsBy[p];
      if (m.ignored[p] && !(r && (r.index !== null || r.head !== null))) tags.push(['i', 'I', 'ignoré par .gitignore']);
      else if (r) {
        if (r.index === null && r.work !== null) tags.push(['u', 'U', 'non suivi']);
        if (r.index !== null && r.index !== r.head) tags.push(['s', 'S', 'sélectionné pour le prochain commit']);
        if (r.index !== null && r.work !== r.index) tags.push(['m', 'M', r.work === null ? 'supprimé' : 'modifié, non sélectionné']);
      }
      return tags;
    }

    function renderTree() {
      var m = lastModel;
      if (!m) return;
      // nested structure from the flat file list
      var rootNode = { dirs: {}, files: [] };
      m.files.forEach(function (p) {
        var parts = p.split('/');
        var node = rootNode;
        for (var i = 0; i < parts.length - 1; i++) {
          var key = parts.slice(0, i + 1).join('/');
          node.dirs[parts[i]] = node.dirs[parts[i]] || { dirs: {}, files: [], path: key };
          node = node.dirs[parts[i]];
        }
        node.files.push(p);
      });
      function sortName(a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; }
      function renderNode(node, depth) {
        var html = '';
        Object.keys(node.dirs).sort(sortName).forEach(function (name) {
          var d = node.dirs[name];
          var open = !collapsed[d.path];
          var dirIgnored = m.ignoredDirs[d.path];
          html += '<li class="gw-dir' + (dirIgnored ? ' is-ignored' : '') + '">' +
            '<button type="button" class="gw-node gw-node-dir" aria-expanded="' + open + '" data-dir="' + esc(d.path) + '" style="--depth:' + depth + '">' +
            '<span class="gw-caret" aria-hidden="true">' + (open ? '▾' : '▸') + '</span>' + esc(name) + '/' +
            (dirIgnored ? '<b class="gw-tag gw-tag-i" title="ignoré par .gitignore">I</b><span class="gw-sr"> (ignoré par .gitignore)</span>' : '') +
            '</button>' +
            (open ? '<ul role="list">' + renderNode(d, depth + 1) + '</ul>' : '') + '</li>';
        });
        node.files.slice().sort(function (a, b) { return sortName(basename(a), basename(b)); }).forEach(function (p) {
          var tags = fileTags(p);
          var b = buffers[p];
          var dirty = b && b.dirty;
          var label = basename(p) + (tags.length ? ', ' + tags.map(function (t) { return t[2]; }).join(', ') : '') + (dirty ? ', modifications non enregistrées' : '');
          html += '<li><button type="button" class="gw-node gw-node-file' + (p === openPath ? ' is-open' : '') +
            (m.ignored[p] ? ' is-ignored' : '') + '" data-file="' + esc(p) + '" style="--depth:' + depth + '"' +
            ' aria-label="' + esc(label) + '"' + (p === openPath ? ' aria-current="true"' : '') + '>' +
            '<span class="gw-fname">' + esc(basename(p)) + '</span>' +
            (dirty ? '<b class="gw-dirty-dot" aria-hidden="true">●</b>' : '') +
            tags.map(function (t) { return '<b class="gw-tag gw-tag-' + t[0] + '" aria-hidden="true" title="' + esc(t[2]) + '">' + t[1] + '</b>'; }).join('') +
            '</button></li>';
        });
        return html;
      }
      tree.innerHTML = renderNode(rootNode, 0);
    }

    tree.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      if (btn.hasAttribute('data-dir')) {
        var d = btn.getAttribute('data-dir');
        collapsed[d] = !collapsed[d];
        renderTree();
        var again = tree.querySelector('[data-dir="' + d.replace(/"/g, '\\"') + '"]');
        if (again) again.focus();
        return;
      }
      if (btn.hasAttribute('data-file')) openFile(btn.getAttribute('data-file'));
    });

    /* ----------------------------- zones ----------------------------- */

    function renderZones() {
      var m = lastModel;
      if (!m) return;
      var repoHead = m.commits.length
        ? '<code>' + esc(m.commits[0].short) + '</code> ' + esc(m.commits[0].message)
        : 'aucun commit';
      var h =
        '<div class="gw-pane-h">Les trois zones de Git</div>' +
        '<div class="gw-zgrid" role="table" aria-label="Version de chaque fichier dans les trois zones">' +
          '<div class="gw-zrow gw-zhead" role="row">' +
            '<div class="gw-zh gw-zh-work" role="columnheader"><strong>Répertoire de travail</strong><span>vos fichiers enregistrés</span></div>' +
            '<div class="gw-zarrow" aria-hidden="true"><code>git add</code>→</div>' +
            '<div class="gw-zh gw-zh-stage" role="columnheader"><strong>Zone de sélection</strong><span>la prochaine photo</span></div>' +
            '<div class="gw-zarrow" aria-hidden="true"><code>git commit</code>→</div>' +
            '<div class="gw-zh gw-zh-repo" role="columnheader"><strong>Dépôt</strong><span>' + (m.isRepo ? 'dernier commit&nbsp;: ' + repoHead : 'pas encore de dépôt (<code>git init</code>)') + '</span></div>' +
          '</div>';

      // unsaved editor buffers: Git cannot see them yet
      var unsaved = Object.keys(buffers).filter(function (p) { return buffers[p].dirty; });

      var changed = m.zoneFiles;
      // untracked files (or every file, before `git init`): one row of chips
      if (m.untracked.length) {
        h += '<div class="gw-zrow gw-zrow-untracked" role="row">' +
          '<div class="gw-zcell gw-zcell-work is-untracked" role="cell">' +
            '<span class="gw-zmob" aria-hidden="true">Répertoire de travail</span>' +
            '<span class="gw-zchips">' + m.untracked.map(function (p) { return '<code>' + esc(p) + '</code>'; }).join(' ') + '</span>' +
            '<span class="gw-znote-cell">' + (m.isRepo
              ? (m.untracked.length > 1 ? 'non suivis' : 'non suivi') + '&nbsp;: Git les voit, mais ne les photographie pas'
              : 'Git ne suit pas encore ce dossier&nbsp;: <code>git init</code>') + '</span>' +
          '</div>' +
          '<div class="gw-zarrow" aria-hidden="true"></div>' +
          '<div class="gw-zcell gw-zcell-stage is-absent" role="cell"><span class="gw-zmob" aria-hidden="true">Zone de sélection</span><span class="gw-znote-cell">—</span></div>' +
          '<div class="gw-zarrow" aria-hidden="true"></div>' +
          '<div class="gw-zcell gw-zcell-repo is-absent" role="cell"><span class="gw-zmob" aria-hidden="true">Dépôt</span><span class="gw-znote-cell">—</span></div>' +
        '</div>';
      }
      if (!changed.length && !unsaved.length && !m.untracked.length) {
        h += '<div class="gw-zempty" role="row"><span role="cell">' +
          (m.isRepo ? 'Les trois zones sont identiques&nbsp;: rien à photographier.' : 'Git ne suit pas encore ce dossier.') +
          '</span></div>';
      }
      changed.forEach(function (z) {
        h += '<div class="gw-zrow" role="row">' +
          cell('work', z.file, z.work, z.workTag, z.workNote) +
          '<div class="gw-zarrow" aria-hidden="true"></div>' +
          cell('stage', z.file, z.index, z.indexTag, z.indexNote) +
          '<div class="gw-zarrow" aria-hidden="true"></div>' +
          cell('repo', z.file, z.head, z.headTag, z.headNote) +
        '</div>';
      });
      h += '</div>';
      if (unsaved.length) {
        h += '<p class="gw-znote gw-znote-unsaved"><b class="gw-dirty-dot" aria-hidden="true">●</b> ' +
          'Non enregistré dans l\'éditeur&nbsp;: ' + unsaved.map(function (p) { return '<code>' + esc(p) + '</code>'; }).join(', ') +
          '. Git ne voit pas ces modifications tant que vous n\'enregistrez pas.</p>';
      }
      if (m.isRepo && m.same.length) {
        h += '<details class="gw-zsame"><summary>' + m.same.length + ' fichier' + (m.same.length > 1 ? 's' : '') +
          ' identique' + (m.same.length > 1 ? 's' : '') + ' dans les trois zones</summary><p>' +
          m.same.map(function (p) { return '<code>' + esc(p) + '</code>'; }).join(' ') + '</p></details>';
      }
      if (m.ignoredList.length) {
        h += '<p class="gw-znote gw-znote-ignored"><b class="gw-tag gw-tag-i" aria-hidden="true">I</b> ' +
          'Ignorés par <code>.gitignore</code>, jamais dans les zones&nbsp;: ' +
          m.ignoredList.map(function (p) { return '<code>' + esc(p) + '</code>'; }).join(', ') + '</p>';
      }
      if (m.commits.length) {
        h += '<details class="gw-zlog"><summary>Historique&nbsp;: ' + m.commits.length + ' commit' + (m.commits.length > 1 ? 's' : '') + '</summary><ol>' +
          m.commits.map(function (c) { return '<li><code>' + esc(c.short) + '</code> ' + esc(c.message) + '</li>'; }).join('') +
          '</ol></details>';
      }
      zones.innerHTML = h;
    }

    function cell(zone, file, snippet, tag, note) {
      var labels = { work: 'Répertoire de travail', stage: 'Zone de sélection', repo: 'Dépôt' };
      return '<div class="gw-zcell gw-zcell-' + zone + (tag ? ' is-' + tag : '') + '" role="cell">' +
        '<span class="gw-zmob" aria-hidden="true">' + labels[zone] + '</span>' +
        '<span class="gw-zfile">' + esc(basename(file)) + '<span class="gw-sr"> — ' + labels[zone] + '</span></span>' +
        (snippet !== null && snippet !== undefined
          ? '<code class="gw-zsnip">' + esc(snippet) + '</code>'
          : '') +
        (note ? '<span class="gw-znote-cell">' + note + '</span>' : '') +
      '</div>';
    }

    /* ------------------------------ model ---------------------------- */

    async function buildModel() {
      var isRepo = await sb.isRepo();
      var files = await sb.listFiles();
      var rows = isRepo ? await sb.zoneRows() : [];
      var rowsBy = {};
      rows.forEach(function (r) { rowsBy[r.file] = r; });
      var ignored = {}, ignoredDirs = {};
      for (var i = 0; i < files.length; i++) {
        if (isRepo && !rowsBy[files[i]] && (await sb.isIgnored(files[i]))) {
          ignored[files[i]] = true;
          var parts = files[i].split('/');
          if (parts.length > 1) ignoredDirs[parts[0]] = true;
        }
      }
      // a folder is shown as ignored only when every file in it is
      Object.keys(ignoredDirs).forEach(function (d) {
        if (files.some(function (f) { return f.indexOf(d + '/') === 0 && !ignored[f]; })) delete ignoredDirs[d];
      });
      var graph = await sb.graphModel();
      var zoneFiles = [], same = [], untracked = [];
      if (!isRepo) untracked = files.slice();
      for (var k = 0; k < rows.length; k++) {
        var r = rows[k];
        if (r.work === r.index && r.index === r.head) { same.push(r.file); continue; }
        if (r.index === null && r.head === null) { untracked.push(r.file); continue; }
        var v = await sb.fileVersions(r.file);
        var texts = [r.work !== null ? v.work : null, r.index !== null ? v.index : null, r.head !== null ? v.head : null];
        var line = keyLine(texts);
        var z = {
          file: r.file,
          work: snippetOf(texts[0], line),
          index: snippetOf(texts[1], line),
          head: snippetOf(texts[2], line)
        };
        // work
        if (r.work === null) { z.workTag = 'gone'; z.workNote = 'supprimé'; }
        else if (r.index === null) { z.workTag = 'untracked'; z.workNote = 'non suivi'; z.work = null; }
        else if (r.work !== r.index) { z.workTag = 'modified'; z.workNote = 'modifié, <strong>non sélectionné</strong>'; }
        else { z.workTag = 'same'; z.workNote = '= sélection'; }
        // stage
        if (r.index === null) { z.indexTag = 'absent'; z.indexNote = r.head !== null ? 'suppression sélectionnée' : '—'; }
        else if (r.index !== r.head) { z.indexTag = 'staged'; z.indexNote = '<strong>sélectionné</strong> pour le prochain commit'; }
        else { z.indexTag = 'same'; z.indexNote = '= dépôt'; }
        // repo
        if (r.head === null) { z.headTag = 'absent'; z.headNote = 'pas encore dans le dépôt'; }
        else { z.headTag = 'committed'; z.headNote = 'version du dernier commit'; }
        zoneFiles.push(z);
      }
      var ignoredList = [];
      Object.keys(ignored).sort().forEach(function (f) {
        var d = f.split('/')[0];
        var shown = ignoredDirs[d] ? d + '/' : f;
        if (ignoredList.indexOf(shown) === -1) ignoredList.push(shown);
      });
      return {
        isRepo: isRepo, files: files, rows: rows, rowsBy: rowsBy,
        ignored: ignored, ignoredDirs: ignoredDirs, ignoredList: ignoredList,
        zoneFiles: zoneFiles, same: same, untracked: untracked,
        commits: graph.commits, branch: graph.head, headOid: graph.headOid || null,
        status: isRepo ? await sb.statusModel() : { staged: [], modified: [], untracked: [], deleted: [], stagedDeleted: [] }
      };
    }

    // After a git command, reconcile the editor with the disk: clean buffers
    // follow the disk (e.g. after `git restore`), dirty ones are flagged.
    async function reconcileBuffers() {
      var paths = Object.keys(buffers);
      for (var i = 0; i < paths.length; i++) {
        var p = paths[i], b = buffers[p];
        var disk = null;
        try { disk = await sb.readFile(p); } catch (e) { disk = null; }
        if (disk === null) {
          if (!b.dirty) {
            delete buffers[p];
            if (openPath === p) { openPath = null; text.value = ''; text.disabled = true; syncGutter(); }
          }
          continue;
        }
        if (!b.dirty) {
          if (disk !== b.text) { b.text = disk; b.base = disk; if (p === openPath) { var pos = text.selectionStart; text.value = disk; text.selectionStart = text.selectionEnd = Math.min(pos, disk.length); syncGutter(); } }
        } else {
          b.stale = disk !== b.base;
        }
      }
      renderEditorHead();
      renderNotice();
    }

    async function refresh(opts) {
      opts = opts || {};
      lastModel = await buildModel();
      await reconcileBuffers();
      renderTree();
      renderZones();
      promptEl.textContent = promptText();
      undoBtn.disabled = !undoStack.length;
      if (!opts.skipChecks) await evaluate();
    }

    /* ----------------------------- missions -------------------------- */

    function renderSteps() {
      stepsList.innerHTML = missions.map(function (m, i) {
        var done = !!completed[m.id];
        return '<li><button type="button" class="gw-step' + (i === current ? ' is-current' : '') + (done ? ' is-done' : '') + '"' +
          ' data-i="' + i + '"' + (i === current ? ' aria-current="step"' : '') + '>' +
          (m.kind ? '<span class="gw-step-kind">' + esc(m.kind) + (m.duration ? ' · ' + esc(m.duration) : '') + '</span>' : '') +
          '<span class="gw-step-name">' + esc(m.short) + '</span>' +
          '<span class="gw-step-mark" aria-hidden="true">' + (done ? '✓' : '') + '</span>' +
          (done ? '<span class="gw-sr"> (terminée)</span>' : '') +
          '</button></li>';
      }).join('');
    }

    stepsList.addEventListener('click', function (e) {
      var b = e.target.closest('.gw-step');
      if (!b) return;
      var i = +b.getAttribute('data-i');
      if (i === current) return;
      if (hasProgress() && !completed[mission().id] &&
          !root.confirm('Changer de mission remet le projet dans l\'état de départ de la nouvelle mission. Continuer ?')) return;
      goTo(i);
    });

    function hasProgress() {
      return undoStack.length > 0 || Object.keys(checks).length > 0;
    }

    // Mission texts mention scripts/02_nettoyage.R: adapt them to the language
    function adaptTexts(node) {
      if (!cfg.swapLang) return;
      var walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
      var n;
      while ((n = walker.nextNode())) {
        var t = cfg.swapLang(n.nodeValue, lang);
        if (t !== n.nodeValue) n.nodeValue = t;
      }
    }

    function setupMission() {
      var m = mission();
      panel.innerHTML = '';
      panel.appendChild(m.node);
      m.node.hidden = false;
      adaptTexts(m.node);

      // checklist items: <li><span data-check="key">…</span></li>
      m.items = Array.prototype.map.call(m.node.querySelectorAll('[data-check]'), function (span) {
        var li = span.closest('li') || span;
        li.classList.add('gw-check');
        if (!li.querySelector('.gw-check-mark')) li.insertAdjacentHTML('afterbegin', '<span class="gw-check-mark" aria-hidden="true"></span>');
        return { key: span.getAttribute('data-check'), li: li, label: span.textContent.trim() };
      });

      // progressive hints: only the first button at first
      var hints = m.node.querySelector('.gw-hints');
      if (hints && !hints.getAttribute('data-ready')) {
        hints.setAttribute('data-ready', '1');
        var parts = Array.prototype.slice.call(hints.querySelectorAll(':scope > .gw-hint, :scope > .gw-solution'));
        var bar = el('div', 'gw-hint-bar');
        hints.insertBefore(bar, hints.firstChild);
        parts.forEach(function (p, idx) {
          p.hidden = true;
          p.id = p.id || (uid + '-' + m.id + '-hint-' + idx);
          var isSol = p.classList.contains('gw-solution');
          var b = el('button', 'gw-btn gw-hint-btn' + (isSol ? ' gw-sol-btn' : ''), isSol ? 'Voir la solution' : 'Indice ' + (idx + 1));
          b.type = 'button';
          b.setAttribute('aria-expanded', 'false');
          b.setAttribute('aria-controls', p.id);
          b.hidden = idx > 0;
          b.addEventListener('click', function () {
            p.hidden = false;
            b.setAttribute('aria-expanded', 'true');
            b.disabled = true;
            var next = bar.children[idx + 1];
            if (next) next.hidden = false;
            p.setAttribute('tabindex', '-1');
            p.focus();
          });
          bar.appendChild(b);
        });
      }
      m.node.querySelectorAll('.gw-hints .gw-hint, .gw-hints .gw-solution').forEach(function (p) { p.hidden = true; });
      m.node.querySelectorAll('.gw-hint-btn').forEach(function (b, idx) {
        b.hidden = idx > 0; b.disabled = false; b.setAttribute('aria-expanded', 'false');
      });

      // micro-question: two buttons, an explanation for each answer
      m.node.querySelectorAll('.gw-question').forEach(function (qn) {
        var qid = qn.getAttribute('data-id') || 'q';
        var answersEls = Array.prototype.slice.call(qn.querySelectorAll('.gw-answer'));
        var bar = qn.querySelector('.gw-q-bar');
        if (!bar) {
          bar = el('div', 'gw-q-bar');
          answersEls.forEach(function (a) {
            var b = el('button', 'gw-btn gw-q-btn', esc(a.getAttribute('data-label') || a.getAttribute('data-for')));
            b.type = 'button';
            b.setAttribute('data-for', a.getAttribute('data-for'));
            b.addEventListener('click', function () {
              answers[qid] = a.getAttribute('data-for');
              events.push({ type: 'answer', id: qid, value: answers[qid] });
              showAnswer(qn);
              evaluate();
            });
            bar.appendChild(b);
          });
          qn.insertBefore(bar, answersEls[0]);
        }
        showAnswer(qn);
      });

      renderMissionState();
      renderSteps();
    }

    function showAnswer(qn) {
      var qid = qn.getAttribute('data-id') || 'q';
      var val = answers[qid];
      qn.querySelectorAll('.gw-answer').forEach(function (a) {
        a.hidden = a.getAttribute('data-for') !== val;
        if (!a.hidden) a.setAttribute('role', 'status');
      });
      qn.querySelectorAll('.gw-q-btn').forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-for') === val ? 'true' : 'false');
      });
    }

    function renderMissionState() {
      var m = mission();
      if (!m.items) return;
      var done = 0;
      m.items.forEach(function (it) {
        var ok = !!checks[it.key];
        if (ok) done++;
        it.li.classList.toggle('is-done', ok);
        var mark = it.li.querySelector('.gw-check-mark');
        mark.textContent = ok ? '✓' : '';
        var sr = it.li.querySelector('.gw-sr-state');
        if (!sr) { sr = el('span', 'gw-sr gw-sr-state'); it.li.appendChild(sr); }
        sr.textContent = ok ? ' (fait)' : '';
      });
      var complete = m.items.length > 0 && done === m.items.length;
      var bilan = m.node.querySelector('.gw-bilan');
      if (bilan) bilan.hidden = !complete;
      var counter = m.node.querySelector('.gw-count');
      if (!counter) {
        var list = m.node.querySelector('.gw-checklist');
        if (list) { counter = el('p', 'gw-count'); list.insertBefore(counter, list.firstChild); }
      }
      if (counter) counter.textContent = done + ' étape' + (done > 1 ? 's' : '') + ' sur ' + m.items.length;
      if (complete && !completed[m.id]) {
        completed[m.id] = true;
        persist();
        renderSteps();
        announce('Mission terminée : ' + m.short + '.');
      }
    }

    async function evaluate() {
      var m = mission();
      if (!m.items || !m.def.checks) return;
      var model = lastModel;
      var cache = {};
      async function versions(p) {
        if (!(p in cache)) cache[p] = await sb.fileVersions(p);
        return cache[p];
      }
      var ctx = {
        lang: lang,
        f: function (name) { return cfg.fileFor ? cfg.fileFor(lang, name) : name; },
        model: model,
        status: model.status,
        events: events,
        last: events[events.length - 1] || null,
        startOid: startOid,
        answer: function (id) { return answers[id]; },
        opened: function (p) { return events.some(function (e) { return e.type === 'open' && e.file === p; }); },
        work: async function (p) { return (await versions(p)).work; },
        index: async function (p) { return (await versions(p)).index; },
        head: async function (p) { return (await versions(p)).head; },
        readAt: function (oid, p) { return sb.readAt(oid, p); },
        newCommits: function () {
          var out = [];
          for (var i = 0; i < model.commits.length; i++) {
            if (model.commits[i].oid === startOid) break;
            out.push(model.commits[i]);
          }
          return out;
        }
      };
      var newly = [];
      for (var i = 0; i < m.items.length; i++) {
        var it = m.items[i];
        if (checks[it.key]) continue;
        var fn = m.def.checks[it.key];
        if (!fn) continue;
        var ok = false;
        try { ok = !!(await fn(ctx)); } catch (e) { ok = false; }
        if (ok) { checks[it.key] = true; newly.push(it.label); }
      }
      renderMissionState();
      if (newly.length) announce('Étape validée : ' + newly.join(' ; '));
    }

    async function startMission() {
      var m = mission();
      busy = true;
      buffers = {};
      openPath = null;
      events = [];
      cmdHistory = [];
      histIdx = 0;
      undoStack = [];
      checks = {};
      answers = {};
      out.innerHTML = '';
      text.value = '';
      text.disabled = true;
      syncGutter();
      renderEditorHead();
      setupMission();
      try {
        await sb.reset(function (s) { return m.def.seed(s, lang); });
      } catch (e) {
        writeText('{r}Le projet n\'a pas pu être préparé : ' + e.message + '{/}', 'gw-err');
      }
      startOid = await sb.headOid();
      if (cfg.welcome && cfg.welcome.length) writeWelcome(cfg.welcome);
      (m.def.intro ? m.def.intro(lang) : []).forEach(function (l) { writeText(l, 'gw-note'); });
      busy = false;
      await refresh({ skipChecks: true });
      var first = m.def.open ? m.def.open(lang) : null;
      if (first) await openFile(first, { silent: true });
      renderMissionState();
      // Start reading from the top, so the welcome is seen first.
      if (cfg.welcome && cfg.welcome.length) out.scrollTop = 0;
      persist();
    }

    async function goTo(i) {
      current = i;
      await startMission();
      panel.scrollTop = 0;
      var top = host.getBoundingClientRect().top;
      if (top < 0 && root.scrollBy) root.scrollBy({ top: top - 16, behavior: reducedMotion() ? 'auto' : 'smooth' });
      announce('Mission ouverte : ' + mission().short + '.');
    }

    function reducedMotion() {
      return root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // "Mission suivante" buttons inside the bilans
    panel.addEventListener('click', function (e) {
      var nx = e.target.closest('[data-next-mission]');
      if (nx) {
        e.preventDefault();
        if (current < missions.length - 1) goTo(current + 1);
        return;
      }
      // commands shown in hints can be sent to the terminal input
      var c = e.target.closest('.gw-hints code, .gw-solution code');
      if (c && /^git\s/.test(c.textContent.trim()) && c.closest('p, li')) {
        cmd.value = c.textContent.trim();
        setMobileTab('terminal');
        cmd.focus();
      }
    });

    /* ------------------------------ commands -------------------------- */

    async function submit(line) {
      if (busy) return;
      var trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed === 'undo' || trimmed === 'annuler') { await doUndo(); return; }
      busy = true;
      cmd.disabled = true;
      var entry = capture(trimmed);
      write('<span class="gw-echo-prompt">' + esc(promptText()) + '</span> ' + esc(trimmed), 'gw-echo');
      cmdHistory.push(trimmed);
      histIdx = cmdHistory.length;
      if (trimmed === 'clear') {
        out.innerHTML = '';
      } else if (trimmed === 'help' || trimmed === 'aide') {
        writeText(helpText());
      } else {
        var r = await sb.run(trimmed);
        writeText(r.out, r.ok ? '' : 'gw-err');
        events.push({ type: 'cmd', line: trimmed, ok: !!r.ok });
        if (r.ok && sb.changedSince(entry.core)) pushUndo(entry);
      }
      busy = false;
      cmd.disabled = false;
      await refresh();
      cmd.focus();
    }

    function helpText() {
      return [
        '{w}Ce terminal exécute un vrai Git{/} (isomorphic-git), sur un projet qui ne vit que dans cette page.',
        '',
        '{y}Regarder{/}      git status · git diff · git diff --staged',
        '{y}Choisir{/}       git add <fichier> · git restore --staged <fichier>',
        '{y}Enregistrer{/}   git commit -m "message"',
        '{y}Retrouver{/}     git log --oneline · git show <empreinte>',
        '              git restore <fichier> · git restore --source=<empreinte> <fichier>',
        '{y}Autres{/}        git init · ls · cat <fichier> · pwd · clear · undo',
        '',
        'Pour modifier un fichier : ouvrez-le dans l\'explorateur, modifiez-le, enregistrez (Ctrl+S).'
      ].join('\n');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = cmd.value;
      cmd.value = '';
      submit(v);
    });
    cmd.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' && cmdHistory.length) {
        e.preventDefault();
        histIdx = Math.max(0, histIdx - 1);
        cmd.value = cmdHistory[histIdx] || '';
      } else if (e.key === 'ArrowDown' && cmdHistory.length) {
        e.preventDefault();
        histIdx = Math.min(cmdHistory.length, histIdx + 1);
        cmd.value = cmdHistory[histIdx] || '';
      }
    });
    out.addEventListener('click', function () {
      if (!root.getSelection || !String(root.getSelection())) cmd.focus();
    });

    undoBtn.addEventListener('click', function () { if (!busy) doUndo(); });
    restartBtn.addEventListener('click', function () {
      if (hasProgress() && !root.confirm('Recommencer remet le projet dans l\'état de départ de la mission. Continuer ?')) return;
      startMission().then(function () { announce('Mission recommencée.'); });
    });

    /* ----------------------------- language -------------------------- */

    function renderLang() {
      host.querySelectorAll('.gw-lang-btn').forEach(function (b) {
        var on = b.getAttribute('data-lang') === lang;
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
      });
      host.setAttribute('data-lang', lang);
    }
    host.querySelector('.gw-lang').addEventListener('click', function (e) {
      var b = e.target.closest('.gw-lang-btn');
      if (!b || b.getAttribute('data-lang') === lang) return;
      if (hasProgress() && !root.confirm('Changer de langage recommence la mission en cours avec les scripts ' + b.textContent + '. Continuer ?')) return;
      lang = b.getAttribute('data-lang');
      renderLang();
      startMission().then(function () { announce('Langage : ' + b.textContent + '.'); });
    });
    host.querySelector('.gw-lang').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      var btns = Array.prototype.slice.call(host.querySelectorAll('.gw-lang-btn'));
      var i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      next.focus();
      next.click();
    });

    /* --------------------------- mobile tabs -------------------------- */

    function setMobileTab(name) {
      work.setAttribute('data-mtab', name);
      host.querySelectorAll('.gw-mtabs button').forEach(function (b) {
        var on = b.getAttribute('data-mtab') === name;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    host.querySelector('.gw-mtabs').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mtab]');
      if (b) setMobileTab(b.getAttribute('data-mtab'));
    });

    /* ------------------------------- go ------------------------------- */

    renderLang();
    setMobileTab('editor');
    var ready = startMission();

    return {
      sandbox: sb,
      ready: ready,
      run: submit,
      save: save,
      open: function (p) { return openFile(p); },
      edit: function (p, fn) {
        // test helper: change the open buffer as a learner would
        var b = buffers[p];
        text.value = fn(b ? b.text : '');
        text.dispatchEvent(new Event('input'));
      },
      goTo: goTo,
      undo: doUndo,
      restart: startMission,
      setLang: function (l) { lang = l; renderLang(); return startMission(); },
      state: function () {
        return { lang: lang, mission: mission().id, checks: JSON.parse(JSON.stringify(checks)), openPath: openPath, buffers: cloneBuffers(), completed: JSON.parse(JSON.stringify(completed)) };
      }
    };
  }

  function boot() {
    var pending = root.__gwPending || [];
    var mounted = [];
    pending.forEach(function (p) { mounted.push(mount(p[0], p[1])); });
    root.__gwPending = { push: function (p) { root.GitSandboxWorkbench.instances.push(mount(p[0], p[1])); } };
    root.GitSandboxWorkbench.instances = mounted;
  }

  root.GitSandboxWorkbench = {
    mount: mount,
    boot: boot,
    keyLine: keyLine,
    snippetOf: snippetOf,
    instances: []
  };
})(window);
