/* =====================================================================
   git-sandbox.js — a real git repository that lives entirely in the page.

   Runs isomorphic-git (MIT) against an in-memory filesystem, and renders a
   terminal, a working-directory/staging/repository diagram, and a live commit
   graph. Nothing is sent to a server; nothing is written to disk.

   GENERATED FILE — do not edit. Built from src/ by ./build.sh.
   ===================================================================== */

/* ------------------------------------------------------------------
   git sandbox core: in-memory fs + shell/git command engine + graph model
   No DOM. Works in Node (for tests) and in the browser.
   Requires a global `git` (isomorphic-git UMD).
   ------------------------------------------------------------------ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GitSandboxCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------- memory fs ---------------------------- */

  function createMemFS() {
    var store = new Map();
    var enc = new TextEncoder();
    var dec = new TextDecoder();
    var inode = 1;

    function norm(p) {
      p = String(p).replace(/\\/g, '/');
      if (p.charAt(0) !== '/') p = '/' + p;
      var parts = [];
      p.split('/').forEach(function (seg) {
        if (seg === '' || seg === '.') return;
        if (seg === '..') { parts.pop(); return; }
        parts.push(seg);
      });
      return '/' + parts.join('/');
    }
    function dirname(p) {
      p = norm(p);
      if (p === '/') return '/';
      var i = p.lastIndexOf('/');
      return i <= 0 ? '/' : p.slice(0, i);
    }
    function basename(p) {
      p = norm(p);
      return p.slice(p.lastIndexOf('/') + 1);
    }
    function mkErr(code, path) {
      var msgs = {
        ENOENT: 'no such file or directory',
        EEXIST: 'file already exists',
        ENOTDIR: 'not a directory',
        EISDIR: 'illegal operation on a directory',
        ENOTEMPTY: 'directory not empty',
        EINVAL: 'invalid argument'
      };
      var e = new Error(code + ': ' + (msgs[code] || code) + ", '" + path + "'");
      e.code = code;
      e.path = path;
      e.errno = -1;
      return e;
    }
    function statObj(node) {
      var isDir = node.type === 'dir';
      var isLink = node.type === 'symlink';
      return {
        type: node.type,
        mode: node.mode,
        size: isDir ? 0 : (node.content ? node.content.length : 0),
        ino: node.ino,
        mtimeMs: node.mtimeMs,
        ctimeMs: node.mtimeMs,
        uid: 1, gid: 1, dev: 1,
        isFile: function () { return node.type === 'file'; },
        isDirectory: function () { return isDir; },
        isSymbolicLink: function () { return isLink; }
      };
    }
    function get(p) { return store.get(norm(p)); }
    function requireParentDir(p) {
      var d = dirname(p);
      var pn = store.get(d);
      if (!pn) throw mkErr('ENOENT', p);
      if (pn.type !== 'dir') throw mkErr('ENOTDIR', p);
    }

    store.set('/', { type: 'dir', mode: 16877, mtimeMs: Date.now(), ino: inode++ });

    var promises = {
      readFile: function (p, opts) {
        return Promise.resolve().then(function () {
          var n = get(p);
          if (!n) throw mkErr('ENOENT', p);
          if (n.type === 'dir') throw mkErr('EISDIR', p);
          var encoding = typeof opts === 'string' ? opts : (opts && opts.encoding);
          return encoding ? dec.decode(n.content) : n.content.slice();
        });
      },
      writeFile: function (p, data, opts) {
        return Promise.resolve().then(function () {
          requireParentDir(p);
          var bytes = typeof data === 'string' ? enc.encode(data)
            : (data instanceof Uint8Array ? new Uint8Array(data) : enc.encode(String(data)));
          var mode = (opts && typeof opts === 'object' && opts.mode) || 33188;
          var existing = get(p);
          store.set(norm(p), {
            type: 'file', content: bytes, mode: existing ? existing.mode : mode,
            mtimeMs: Date.now(), ino: existing ? existing.ino : inode++
          });
        });
      },
      unlink: function (p) {
        return Promise.resolve().then(function () {
          var n = get(p);
          if (!n) throw mkErr('ENOENT', p);
          if (n.type === 'dir') throw mkErr('EISDIR', p);
          store.delete(norm(p));
        });
      },
      readdir: function (p) {
        return Promise.resolve().then(function () {
          var d = norm(p);
          var n = store.get(d);
          if (!n) throw mkErr('ENOENT', p);
          if (n.type !== 'dir') throw mkErr('ENOTDIR', p);
          var prefix = d === '/' ? '/' : d + '/';
          var out = [];
          store.forEach(function (_v, k) {
            if (k === d || k.indexOf(prefix) !== 0) return;
            var rest = k.slice(prefix.length);
            if (rest.indexOf('/') === -1 && rest !== '') out.push(rest);
          });
          return out.sort();
        });
      },
      mkdir: function (p, opts) {
        return Promise.resolve().then(function () {
          var d = norm(p);
          if (store.has(d)) {
            if (opts && opts.recursive) return;
            throw mkErr('EEXIST', p);
          }
          if (opts && opts.recursive) {
            var parts = d.split('/').filter(Boolean);
            var cur = '';
            parts.forEach(function (seg) {
              cur += '/' + seg;
              if (!store.has(cur)) store.set(cur, { type: 'dir', mode: 16877, mtimeMs: Date.now(), ino: inode++ });
            });
            return;
          }
          requireParentDir(d);
          store.set(d, { type: 'dir', mode: 16877, mtimeMs: Date.now(), ino: inode++ });
        });
      },
      rmdir: function (p) {
        return Promise.resolve().then(function () {
          var d = norm(p);
          var n = store.get(d);
          if (!n) throw mkErr('ENOENT', p);
          if (n.type !== 'dir') throw mkErr('ENOTDIR', p);
          var prefix = d === '/' ? '/' : d + '/';
          var empty = true;
          store.forEach(function (_v, k) { if (k !== d && k.indexOf(prefix) === 0) empty = false; });
          if (!empty) throw mkErr('ENOTEMPTY', p);
          store.delete(d);
        });
      },
      stat: function (p) {
        return Promise.resolve().then(function () {
          var n = get(p);
          if (!n) throw mkErr('ENOENT', p);
          return statObj(n);
        });
      },
      lstat: function (p) { return promises.stat(p); },
      readlink: function (p) {
        return Promise.resolve().then(function () {
          var n = get(p);
          if (!n || n.type !== 'symlink') throw mkErr('EINVAL', p);
          return n.target;
        });
      },
      symlink: function (target, p) {
        return Promise.resolve().then(function () {
          requireParentDir(p);
          store.set(norm(p), { type: 'symlink', target: target, mode: 41453, mtimeMs: Date.now(), ino: inode++ });
        });
      },
      chmod: function (p, mode) {
        return Promise.resolve().then(function () {
          var n = get(p);
          if (!n) throw mkErr('ENOENT', p);
          n.mode = mode;
        });
      },
      rm: function (p, opts) {
        return Promise.resolve().then(function () {
          var d = norm(p);
          var n = store.get(d);
          if (!n) {
            if (opts && opts.force) return;
            throw mkErr('ENOENT', p);
          }
          if (n.type === 'dir' && opts && opts.recursive) {
            var prefix = d === '/' ? '/' : d + '/';
            var kill = [];
            store.forEach(function (_v, k) { if (k === d || k.indexOf(prefix) === 0) kill.push(k); });
            kill.forEach(function (k) { store.delete(k); });
            return;
          }
          if (n.type === 'dir') throw mkErr('EISDIR', p);
          store.delete(d);
        });
      }
    };

    return {
      promises: promises,
      _store: store,
      _norm: norm,
      _dirname: dirname,
      _basename: basename
    };
  }

  /* --------------------------- tokenizing --------------------------- */

  // Split a command line into tokens, honouring single/double quotes,
  // and pull out redirection targets (> and >>).
  function tokenize(line) {
    var tokens = [];
    var cur = '';
    var has = false;
    var quote = null;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (quote) {
        if (ch === quote) { quote = null; }
        else if (ch === '\\' && quote === '"' && i + 1 < line.length) { cur += line[++i]; has = true; }
        else { cur += ch; has = true; }
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
      if (ch === ' ' || ch === '\t') {
        if (has) { tokens.push(cur); cur = ''; has = false; }
        continue;
      }
      if (ch === '>' ) {
        if (has) { tokens.push(cur); cur = ''; has = false; }
        if (line[i + 1] === '>') { tokens.push('>>'); i++; } else { tokens.push('>'); }
        continue;
      }
      cur += ch; has = true;
    }
    if (has) tokens.push(cur);
    if (quote) throw new Error('unmatched quote');
    return tokens;
  }

  function splitRedirect(tokens) {
    var out = { args: [], redirect: null, target: null };
    for (var i = 0; i < tokens.length; i++) {
      if (tokens[i] === '>' || tokens[i] === '>>') {
        out.redirect = tokens[i];
        out.target = tokens[i + 1] || null;
        i++;
        continue;
      }
      out.args.push(tokens[i]);
    }
    return out;
  }

  /* ------------------------------ engine ---------------------------- */

  function createSandbox(options) {
    options = options || {};
    var gitlib = options.git || (typeof self !== 'undefined' ? self.git : null);
    if (!gitlib) throw new Error('isomorphic-git not found');

    var fs = createMemFS();
    var dir = options.dir || '/project';
    // Path shown to the user in messages and pwd; the real in-memory fs
    // stays rooted at `dir` regardless of what the prompt displays.
    var displayDir = options.displayDir || '~' + dir;
    // Mock remote: a bare repository elsewhere in the same in-memory fs,
    // created by `git remote add origin <url>`. Push/pull/fetch move objects
    // and refs between it and the local repo — nothing leaves the page.
    var remoteGitdir = '/origin';
    var remoteUrl = null;
    var upstreams = {};   // branch name -> true once `push -u` recorded it
    // Merges that actually moved a ref ({ from, into }), via `git merge` or
    // `git pull`. The graph alone cannot distinguish "freshly branched off Y"
    // from "fast-forward merged into Y" — both leave X's tip an ancestor of
    // Y's — so `merged X into Y` conditions need this record.
    var mergesDone = [];
    var author = { name: 'Your Name', email: 'you@example.com' };
    var defaultBranch = options.defaultBranch || 'main';
    var repoReady = false;

    var base = { fs: fs, dir: dir };
    function opts(extra) {
      var o = { fs: fs, dir: dir };
      for (var k in extra) o[k] = extra[k];
      return o;
    }

    function abs(p) {
      if (!p) return dir;
      return p.charAt(0) === '/' ? fs._norm(p) : fs._norm(dir + '/' + p);
    }
    function rel(p) {
      var a = abs(p);
      return a.indexOf(dir + '/') === 0 ? a.slice(dir.length + 1) : a.replace(/^\//, '');
    }

    async function ensureWorkdir() {
      await fs.promises.mkdir(dir, { recursive: true });
    }

    async function isRepo() {
      try { await fs.promises.stat(dir + '/.git'); return true; }
      catch (e) { return false; }
    }

    async function currentBranch() {
      try { return (await gitlib.currentBranch(opts({ fullname: false }))) || null; }
      catch (e) { return null; }
    }

    // list tracked+untracked files in the workdir (excluding .git)
    async function listFiles() {
      var out = [];
      var prefix = dir + '/';
      fs._store.forEach(function (v, k) {
        if (k.indexOf(prefix) !== 0) return;
        if (k === dir + '/.git' || k.indexOf(dir + '/.git/') === 0) return;
        if (v.type !== 'file') return;
        out.push(k.slice(prefix.length));
      });
      return out.sort();
    }

    /* ----------------- the three zones, by content --------------------- */

    // Git's own status compares file *contents*. isomorphic-git's
    // statusMatrix trusts the index stat cache (size + mtime) instead, which
    // misses an edit of the same length made within the same millisecond as
    // `git add` — exactly "0.10 → 0.15 right after add". Everything below
    // therefore compares blob ids computed from the actual bytes.
    var textDec = new TextDecoder();

    async function headOid() {
      try { return await gitlib.resolveRef(opts({ ref: 'HEAD' })); }
      catch (e) { return null; }
    }

    // { path: blobOid } for a tree walker (STAGE, or TREE of a commit)
    async function blobMap(walker) {
      var entries = await gitlib.walk(opts({
        trees: [walker],
        map: async function (fp, list) {
          var e = list[0];
          if (!e || fp === '.') return undefined;
          if ((await e.type()) !== 'blob') return undefined;
          return { fp: fp, oid: await e.oid() };
        }
      }));
      var out = {};
      (entries || []).forEach(function (x) { if (x && x.fp) out[x.fp] = x.oid; });
      return out;
    }

    async function indexMap() {
      if (!(await isRepo())) return {};
      try { return await blobMap(gitlib.STAGE()); }
      catch (e) { return {}; }
    }

    async function treeMap(commitOid) {
      if (!commitOid) return {};
      return blobMap(gitlib.TREE({ ref: commitOid }));
    }

    // Write a working file, creating its folders (the editor saves through
    // this too, so terminal and editor share one filesystem).
    async function writeWork(file, text) {
      var p = abs(file);
      await fs.promises.mkdir(fs._dirname(p), { recursive: true });
      await fs.promises.writeFile(p, text);
    }

    async function hashText(text) {
      return (await gitlib.hashBlob({ object: text })).oid;
    }

    async function readBlobText(oid) {
      return textDec.decode((await gitlib.readBlob(opts({ oid: oid }))).blob);
    }

    async function isIgnored(file) {
      if (!(await isRepo())) {
        // before `git init` there is no git to ask; read .gitignore ourselves
        return false;
      }
      try { return await gitlib.isIgnored(opts({ filepath: file })); }
      catch (e) { return false; }
    }

    // Working files git can see: every file, minus ignored ones that are
    // not already tracked (a tracked file stays tracked whatever .gitignore
    // says, as in real git).
    async function workMap(index) {
      var files = await listFiles();
      var out = {};
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        if (!(f in index) && (await isIgnored(f))) continue;
        out[f] = await hashText(await fs.promises.readFile(dir + '/' + f));
      }
      return out;
    }

    // One row per path known to any zone:
    // { file, work, index, head } — blob ids, or null when absent there.
    async function zoneRows() {
      var index = await indexMap();
      var head = await treeMap(await headOid());
      var work = await workMap(index);
      var all = {};
      [work, index, head].forEach(function (m) { Object.keys(m).forEach(function (k) { all[k] = true; }); });
      return Object.keys(all).sort().map(function (f) {
        return {
          file: f,
          work: f in work ? work[f] : null,
          index: f in index ? index[f] : null,
          head: f in head ? head[f] : null
        };
      });
    }

    // Text of one file in each zone (null when absent), for the editor and
    // the three-zone diagram.
    async function fileVersions(file) {
      var out = { work: null, index: null, head: null };
      try { out.work = await fs.promises.readFile(abs(file), 'utf8'); } catch (e) {}
      if (!(await isRepo())) return out;
      var index = await indexMap();
      if (file in index) out.index = await readBlobText(index[file]);
      var head = await treeMap(await headOid());
      if (file in head) out.head = await readBlobText(head[file]);
      return out;
    }

    /* ------------------------------ remote -------------------------- */

    // options builder for commands that read the remote's bare repo
    function ropts(extra) {
      var o = { fs: fs, gitdir: remoteGitdir };
      for (var k in extra) o[k] = extra[k];
      return o;
    }

    async function remoteBranchOid(name) {
      try { return (await fs.promises.readFile(remoteGitdir + '/refs/heads/' + name, 'utf8')).trim(); }
      catch (e) { return null; }
    }

    async function listRemoteBranchNames() {
      try { return (await fs.promises.readdir(remoteGitdir + '/refs/heads')).sort(); }
      catch (e) { return []; }
    }

    // Copy every git object file present under `from` but missing under `to`.
    // Both repos live in the same in-memory fs, so a push/fetch "transfer"
    // is a plain file copy.
    async function copyObjects(fromGitdir, toGitdir) {
      var prefix = fromGitdir + '/objects/';
      var paths = [];
      fs._store.forEach(function (v, k) {
        if (v.type === 'file' && k.indexOf(prefix) === 0) paths.push(k);
      });
      for (var i = 0; i < paths.length; i++) {
        var dest = toGitdir + paths[i].slice(fromGitdir.length);
        try { await fs.promises.stat(dest); continue; } catch (e) { /* missing: copy */ }
        await fs.promises.mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
        await fs.promises.writeFile(dest, await fs.promises.readFile(paths[i]));
      }
    }

    // set of commit oids reachable from `oid`, read via the given options builder
    async function reachableFrom(oid, optsFn) {
      var seen = {};
      var queue = [oid];
      while (queue.length) {
        var o = queue.shift();
        if (!o || seen[o]) continue;
        var c;
        try { c = await gitlib.readCommit(optsFn({ oid: o })); } catch (e) { continue; }
        seen[o] = true;
        (c.commit.parent || []).forEach(function (p) { queue.push(p); });
      }
      return seen;
    }

    async function setTrackingRef(branch, oid) {
      await gitlib.writeRef(opts({ ref: 'refs/remotes/origin/' + branch, value: oid, force: true }));
    }

    /* ------------------------- graph model ------------------------- */

    // Shared commit-graph builder. refEntries: [{ name, oid, isHead, remote }].
    // Walks history from the given refs (plus extraSeeds), reading commits
    // with optsFn — opts for the local repo, ropts for the remote.
    async function buildGraph(refEntries, extraSeeds, optsFn) {
      var seeds = refEntries.map(function (e) { return e.oid; })
        .concat(extraSeeds || [])
        .filter(Boolean);

      var seen = new Map();
      var queue = seeds.slice();
      while (queue.length) {
        var oid2 = queue.shift();
        if (!oid2 || seen.has(oid2)) continue;
        var c;
        try { c = await gitlib.readCommit(optsFn({ oid: oid2 })); }
        catch (e) { continue; }
        seen.set(oid2, {
          oid: oid2,
          short: oid2.slice(0, 7),
          message: (c.commit.message || '').split('\n')[0],
          parents: c.commit.parent || [],
          timestamp: c.commit.author.timestamp,
          author: c.commit.author.name,
          refs: []
        });
        (c.commit.parent || []).forEach(function (p) { queue.push(p); });
      }

      // Topological order, children before parents, preferring newer commits.
      // A plain timestamp sort is not enough: commits made in the same second
      // (which happens whenever we seed a repo programmatically) would tie.
      var all = Array.from(seen.values());
      var childCount = {};
      all.forEach(function (c) { childCount[c.oid] = 0; });
      all.forEach(function (c) {
        (c.parents || []).forEach(function (p) {
          if (p in childCount) childCount[p]++;
        });
      });
      var ready = all.filter(function (c) { return childCount[c.oid] === 0; });
      var commits = [];
      var guard = all.length + 1;
      while (ready.length && guard-- > 0) {
        ready.sort(function (a, b) { return b.timestamp - a.timestamp; });
        var next = ready.shift();
        commits.push(next);
        (next.parents || []).forEach(function (p) {
          if (!(p in childCount)) return;
          childCount[p]--;
          if (childCount[p] === 0) ready.push(seen.get(p));
        });
      }
      // safety net: if a cycle ever appeared, fall back to timestamp order
      if (commits.length !== all.length) {
        commits = all.slice().sort(function (a, b) { return b.timestamp - a.timestamp; });
      }

      refEntries.forEach(function (e) {
        var node = seen.get(e.oid);
        if (node) node.refs.push({ name: e.name, isHead: !!e.isHead, remote: !!e.remote });
      });

      // lane assignment: walk newest -> oldest keeping a set of open lanes
      var lanes = [];
      var laneOf = {};
      commits.forEach(function (c2) {
        var lane = lanes.indexOf(c2.oid);
        if (lane === -1) {
          lane = lanes.indexOf(null);
          if (lane === -1) { lane = lanes.length; lanes.push(null); }
        }
        lanes[lane] = null;
        laneOf[c2.oid] = lane;
        c2.lane = lane;
        var ps = c2.parents || [];
        if (ps.length) {
          lanes[lane] = ps[0];
          for (var j = 1; j < ps.length; j++) {
            if (lanes.indexOf(ps[j]) !== -1) continue;
            var free = lanes.indexOf(null);
            if (free === -1) { lanes.push(ps[j]); } else { lanes[free] = ps[j]; }
          }
        }
      });

      return commits;
    }

    async function graphModel() {
      if (!(await isRepo())) return { commits: [], branches: [], head: null, detached: false, merges: [] };

      var branches = await gitlib.listBranches(opts());
      var head = await currentBranch();
      var refs = {};
      var refEntries = [];

      for (var i = 0; i < branches.length; i++) {
        try {
          var oid = await gitlib.resolveRef(opts({ ref: branches[i] }));
          refs[branches[i]] = oid;
          refEntries.push({ name: branches[i], oid: oid, isHead: branches[i] === head });
        } catch (e) { /* unborn branch */ }
      }

      // remote-tracking refs (origin/*) appear as grey pills, like real git log
      if (remoteUrl) {
        var tracked = [];
        try { tracked = await fs.promises.readdir(dir + '/.git/refs/remotes/origin'); } catch (e) {}
        for (var t = 0; t < tracked.length; t++) {
          try {
            var toid = await gitlib.resolveRef(opts({ ref: 'refs/remotes/origin/' + tracked[t] }));
            refEntries.push({ name: 'origin/' + tracked[t], oid: toid, remote: true });
          } catch (e) { /* dangling tracking ref */ }
        }
      }

      // include HEAD in case it is detached
      var headOid = null;
      try { headOid = await gitlib.resolveRef(opts({ ref: 'HEAD' })); }
      catch (e) { /* no commits yet */ }

      var commits = await buildGraph(refEntries, headOid ? [headOid] : [], opts);

      return {
        commits: commits,
        branches: branches.map(function (b) { return { name: b, oid: refs[b] || null, isHead: b === head }; }),
        head: head,
        headOid: headOid,
        detached: head === null && headOid !== null,
        merges: mergesDone.slice()
      };
    }

    // What the mock remote looks like "on GitHub": its own commit graph plus
    // how the learner's current branch compares to it. Null until
    // `git remote add origin <url>` has run.
    async function remoteModel() {
      if (!remoteUrl) return null;
      var names = await listRemoteBranchNames();
      var refEntries = [];
      for (var i = 0; i < names.length; i++) {
        refEntries.push({ name: 'origin/' + names[i], oid: await remoteBranchOid(names[i]), remote: true });
      }
      var commits = await buildGraph(refEntries, [], ropts);

      var branch = await currentBranch();
      var tracked = false, ahead = 0, behind = 0;
      if (branch) {
        var remoteOid = await remoteBranchOid(branch);
        if (remoteOid) {
          tracked = true;
          var localOid = null;
          try { localOid = await gitlib.resolveRef(opts({ ref: branch })); } catch (e) {}
          var localSet = localOid ? await reachableFrom(localOid, opts) : {};
          var remoteSet = await reachableFrom(remoteOid, ropts);
          Object.keys(localSet).forEach(function (o) { if (!remoteSet[o]) ahead++; });
          Object.keys(remoteSet).forEach(function (o) { if (!localSet[o]) behind++; });
        }
      }
      return {
        url: remoteUrl,
        graph: { commits: commits, branches: names, head: null, detached: false },
        branch: branch, tracked: tracked, ahead: ahead, behind: behind
      };
    }

    /* --------------------------- git status ------------------------ */

    // returns { staged:[], modified:[], untracked:[], deleted:[], stagedDeleted:[] }
    // isomorphic-git statusMatrix rows are [filepath, HEAD, WORKDIR, STAGE] where
    //   HEAD:    0 = absent,               1 = present
    //   WORKDIR: 0 = absent,               1 = same as HEAD, 2 = different from HEAD
    //   STAGE:   0 = absent, 1 = same as HEAD, 2 = same as WORKDIR, 3 = different from both
    // Same shape as before, computed from content ids (see zoneRows):
    //   staged       index differs from the last commit
    //   modified     working file differs from the index
    //   untracked    working file git does not know (and does not ignore)
    async function statusModel() {
      var rows = await zoneRows();
      var res = { staged: [], modified: [], untracked: [], deleted: [], stagedDeleted: [] };
      rows.forEach(function (r) {
        if (r.index !== null && r.index !== r.head) {
          res.staged.push({ file: r.file, kind: r.head === null ? 'new file' : 'modified' });
        }
        if (r.index === null && r.head !== null) res.stagedDeleted.push(r.file);
        if (r.index !== null && r.work === null) res.deleted.push(r.file);
        if (r.index !== null && r.work !== null && r.work !== r.index) res.modified.push(r.file);
        if (r.index === null && r.work !== null) res.untracked.push(r.file);
      });
      return res;
    }

    // Like `git status`, show an untracked directory as "dir/" when nothing
    // inside it is known to git.
    function collapseUntracked(untracked, known) {
      var out = [];
      untracked.forEach(function (f) {
        var parts = f.split('/');
        var shown = f;
        for (var n = 1; n < parts.length; n++) {
          var d = parts.slice(0, n).join('/') + '/';
          var hasKnown = known.some(function (k) { return k.indexOf(d) === 0; });
          if (!hasKnown) { shown = d; break; }
        }
        if (out.indexOf(shown) === -1) out.push(shown);
      });
      return out;
    }

    /* -------------------------- git commands ----------------------- */

    // `git status`, worded exactly as git 2.4x prints it (the learners read
    // the same lines on Onyxia afterwards).
    async function statusText() {
      var st = await statusModel();
      var br = await currentBranch();
      var anyCommit = (await headOid()) !== null;
      var lines = ['On branch ' + (br || 'HEAD (detached)')];
      if (!anyCommit) lines.push('', 'No commits yet');
      var sections = [];

      if (st.staged.length || st.stagedDeleted.length) {
        var s1 = ['Changes to be committed:',
          anyCommit ? '  (use "git restore --staged <file>..." to unstage)'
                    : '  (use "git rm --cached <file>..." to unstage)'];
        st.staged.forEach(function (s) {
          s1.push('\t{g}' + (s.kind + ':').padEnd(12) + s.file + '{/}');
        });
        st.stagedDeleted.forEach(function (f) { s1.push('\t{g}deleted:    ' + f + '{/}'); });
        sections.push(s1);
      }
      if (st.modified.length || st.deleted.length) {
        var s2 = ['Changes not staged for commit:',
          st.deleted.length ? '  (use "git add/rm <file>..." to update what will be committed)'
                            : '  (use "git add <file>..." to update what will be committed)',
          '  (use "git restore <file>..." to discard changes in working directory)'];
        st.modified.forEach(function (f) { s2.push('\t{r}modified:   ' + f + '{/}'); });
        st.deleted.forEach(function (f) { s2.push('\t{r}deleted:    ' + f + '{/}'); });
        sections.push(s2);
      }
      if (st.untracked.length) {
        var known = (await zoneRows())
          .filter(function (r) { return r.index !== null || r.head !== null; })
          .map(function (r) { return r.file; });
        var s3 = ['Untracked files:', '  (use "git add <file>..." to include in what will be committed)'];
        collapseUntracked(st.untracked, known).forEach(function (f) { s3.push('\t{r}' + f + '{/}'); });
        sections.push(s3);
      }
      var staged = st.staged.length || st.stagedDeleted.length;
      var hasSections = sections.length > 0;
      if (sections.length) {
        if (anyCommit) lines.push(sections.shift().join('\n'));
        else lines.push('', sections.shift().join('\n'));
        sections.forEach(function (s) { lines.push('', s.join('\n')); });
      }
      if (!staged) {
        var tail;
        if (st.modified.length || st.deleted.length) tail = 'no changes added to commit (use "git add" and/or "git commit -a")';
        else if (st.untracked.length) tail = 'nothing added to commit but untracked files present (use "git add" to track)';
        else if (anyCommit) tail = 'nothing to commit, working tree clean';
        else tail = 'nothing to commit (create/copy files and use "git add" to track)';
        lines.push(hasSections || !anyCommit ? '' : null, tail);
      }
      return lines.filter(function (l) { return l !== null; }).join('\n');
    }

    // Resolve a revision the way learners type it: HEAD, HEAD~n, a branch,
    // or a (short) commit id. Returns a full commit id, or null.
    async function resolveRev(rev) {
      var m = /^(.*?)(?:~(\d+))?$/.exec(rev || 'HEAD');
      var baseRev = m[1] || 'HEAD', back = m[2] ? parseInt(m[2], 10) : 0;
      var oid = null;
      try { oid = await gitlib.resolveRef(opts({ ref: baseRev })); }
      catch (e) {
        if (/^[0-9a-f]{4,40}$/.test(baseRev)) {
          try { oid = await gitlib.expandOid(opts({ oid: baseRev })); } catch (e2) { oid = null; }
        }
      }
      for (var i = 0; oid && i < back; i++) {
        var c = await gitlib.readCommit(opts({ oid: oid }));
        oid = (c.commit.parent || [])[0] || null;
      }
      if (!oid) return null;
      try { await gitlib.readCommit(opts({ oid: oid })); } catch (e) { return null; }
      return oid;
    }

    // "Mon Sep 14 09:05:00 2026 +0200", as `git log` prints dates
    function gitDate(ts, tzOffsetMin) {
      var off = -(tzOffsetMin || 0);   // isomorphic-git stores JS-style offsets
      var d = new Date((ts + off * 60) * 1000);
      var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      var p2 = function (x) { return (x < 10 ? '0' : '') + x; };
      var sign = off >= 0 ? '+' : '-';
      var a = Math.abs(off);
      return days[d.getUTCDay()] + ' ' + months[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' ' +
        p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' ' +
        d.getUTCFullYear() + ' ' + sign + p2(Math.floor(a / 60)) + p2(a % 60);
    }

    // "2026-09-11T17:20:00+02:00" -> { timestamp, timezoneOffset } (JS-style)
    function parseDate(s) {
      var m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d)(?::(\d\d))?\s*(Z|[+-]\d\d:?\d\d)?$/.exec(String(s).trim());
      if (!m) return null;
      var offMin = 0;
      if (m[7] && m[7] !== 'Z') {
        var z = m[7].replace(':', '');
        offMin = (z.charAt(0) === '-' ? -1 : 1) * (parseInt(z.slice(1, 3), 10) * 60 + parseInt(z.slice(3, 5), 10));
      }
      var utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) / 1000 - offMin * 60;
      return { timestamp: utc, timezoneOffset: -offMin };
    }

    // Header + diff of one commit against its first parent, as `git show`
    async function showCommit(oid) {
      var c = await gitlib.readCommit(opts({ oid: oid }));
      var g = await graphModel();
      var node = g.commits.filter(function (x) { return x.oid === oid; })[0];
      var decor = node && node.refs.length
        ? ' {y}(' + node.refs.map(function (r) { return r.isHead ? 'HEAD -> ' + r.name : r.name; }).join(', ') + '){/}'
        : '';
      var a = c.commit.author;
      var out = ['{y}commit ' + oid + '{/}' + decor,
        'Author: ' + a.name + ' <' + a.email + '>',
        'Date:   ' + gitDate(a.timestamp, a.timezoneOffset), ''];
      c.commit.message.replace(/\n+$/, '').split('\n').forEach(function (l) { out.push('    ' + l); });
      var parent = (c.commit.parent || [])[0] || null;
      var before = await treeMap(parent);
      var after = await treeMap(oid);
      var all = {};
      Object.keys(before).concat(Object.keys(after)).forEach(function (k) { all[k] = true; });
      var diffs = [];
      var names = Object.keys(all).sort();
      for (var i = 0; i < names.length; i++) {
        var f = names[i];
        var x = f in before ? before[f] : null, y = f in after ? after[f] : null;
        if (x === y) continue;
        diffs.push(unifiedDiff(f, await textOf(x), await textOf(y), x, y));
      }
      if (diffs.length) out.push('', diffs.join('\n'));
      return out.join('\n');
    }

    async function gitCommand(args) {
      var sub = args[0];
      var rest = args.slice(1);

      if (!sub) return { out: usageGit(), ok: false };

      if (sub !== 'init' && sub !== 'help' && sub !== 'config' && !(await isRepo())) {
        return { out: 'fatal: not a git repository (or any of the parent directories): .git\nHint: run `git init` first.', ok: false };
      }

      switch (sub) {
        case 'init': {
          if (await isRepo()) return { out: 'Reinitialized existing Git repository in ' + displayDir + '/.git/', ok: true };
          await gitlib.init(opts({ defaultBranch: defaultBranch }));
          repoReady = true;
          return { out: 'Initialized empty Git repository in ' + displayDir + '/.git/', ok: true };
        }

        case 'config': {
          if (rest[0] === 'user.name' && rest[1]) { author.name = rest.slice(1).join(' '); return { out: '', ok: true }; }
          if (rest[0] === 'user.email' && rest[1]) { author.email = rest[1]; return { out: '', ok: true }; }
          if (rest[0] === 'user.name') return { out: author.name, ok: true };
          if (rest[0] === 'user.email') return { out: author.email, ok: true };
          return { out: 'usage: git config user.name "Your Name"', ok: false };
        }

        case 'status': {
          return { out: await statusText(), ok: true };
        }

        case 'add': {
          var force = rest.indexOf('-f') !== -1 || rest.indexOf('--force') !== -1;
          var specs = rest.filter(function (a) { return a !== '-f' && a !== '--force'; });
          if (!specs.length) return { out: "Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?", ok: false };
          var rowsA = await zoneRows();
          var toStage = [], ignoredHit = [];
          for (var i = 0; i < specs.length; i++) {
            var spec = specs[i];
            var all = spec === '.' || spec === '-A' || spec === '--all' || spec === '*';
            var matched = rowsA.filter(function (r) { return all || matchesPath(r.file, spec); });
            if (!all && !matched.length) {
              // not visible to git: either absent, or ignored
              var exists = false;
              try { await fs.promises.stat(abs(spec)); exists = true; } catch (e) {}
              if (!exists) return { out: "fatal: pathspec '" + spec + "' did not match any files", ok: false };
              if (force) {
                var under = (await listFiles()).filter(function (f) { return matchesPath(f, spec); });
                under.forEach(function (f) { toStage.push({ file: f, remove: false }); });
              } else {
                ignoredHit.push(rel(spec).split('/')[0]);
              }
              continue;
            }
            matched.forEach(function (r) {
              if (r.work === r.index) return;                 // nothing new to stage
              toStage.push({ file: r.file, remove: r.work === null });
            });
          }
          if (ignoredHit.length) {
            return {
              out: 'The following paths are ignored by one of your .gitignore files:\n' +
                   ignoredHit.filter(function (x, k) { return ignoredHit.indexOf(x) === k; }).join('\n') + '\n' +
                   'hint: Use -f if you really want to add them.',
              ok: false
            };
          }
          for (var j = 0; j < toStage.length; j++) {
            if (toStage[j].remove) await gitlib.remove(opts({ filepath: toStage[j].file }));
            else await gitlib.add(opts({ filepath: toStage[j].file, force: true }));
          }
          return { out: '', ok: true, silentNote: toStage.length + ' path(s) staged' };
        }

        case 'rm': {
          var target = rest.filter(function (a) { return a.charAt(0) !== '-'; })[0];
          if (!target) return { out: 'usage: git rm <file>', ok: false };
          await gitlib.remove(opts({ filepath: rel(target) }));
          try { await fs.promises.unlink(abs(target)); } catch (e) {}
          return { out: "rm '" + rel(target) + "'", ok: true };
        }

        case 'commit': {
          var msg = null;
          for (var k = 0; k < rest.length; k++) {
            if (rest[k] === '-m' || rest[k] === '--message') { msg = rest[k + 1]; break; }
            if (rest[k].indexOf('-m') === 0 && rest[k].length > 2) { msg = rest[k].slice(2); break; }
          }
          if (!msg) return { out: 'Aborting commit due to empty commit message.\nhint: use  git commit -m "your message"', ok: false };
          var when = null;
          for (var kd = 0; kd < rest.length; kd++) {
            if (rest[kd] === '--date') when = parseDate(rest[kd + 1]);
            else if (rest[kd].indexOf('--date=') === 0) when = parseDate(rest[kd].slice(7));
          }
          var st2 = await statusModel();
          if (!st2.staged.length && !st2.stagedDeleted.length) {
            // git answers with the status, and fails
            return { out: await statusText(), ok: false };
          }
          // summary counts: index vs last commit, before committing
          var rowsC = await zoneRows();
          var ins = 0, dels = 0, nFiles = 0, created = [], removed = [];
          for (var rc = 0; rc < rowsC.length; rc++) {
            var rr = rowsC[rc];
            if (rr.index === rr.head) continue;
            nFiles++;
            var cnt = countChanges(await textOf(rr.head), await textOf(rr.index));
            ins += cnt.ins; dels += cnt.del;
            if (rr.head === null) created.push(rr.file);
            if (rr.index === null) removed.push(rr.file);
          }
          var isRoot = (await headOid()) === null;
          var who = { name: author.name, email: author.email };
          if (when) { who.timestamp = when.timestamp; who.timezoneOffset = when.timezoneOffset; }
          var sha = await gitlib.commit(opts({ message: msg, author: who, committer: who }));
          var branch3 = await currentBranch();
          var summary = ' ' + nFiles + ' file' + (nFiles === 1 ? '' : 's') + ' changed';
          if (ins) summary += ', ' + ins + ' insertion' + (ins === 1 ? '' : 's') + '(+)';
          if (dels) summary += ', ' + dels + ' deletion' + (dels === 1 ? '' : 's') + '(-)';
          var outC = ['[' + branch3 + (isRoot ? ' (root-commit)' : '') + ' ' + sha.slice(0, 7) + '] ' + msg, summary];
          created.forEach(function (f) { outC.push(' create mode 100644 ' + f); });
          removed.forEach(function (f) { outC.push(' delete mode 100644 ' + f); });
          return { out: outC.join('\n'), ok: true };
        }

        case 'log': {
          var oneline = rest.indexOf('--oneline') !== -1;
          var commits;
          try { commits = await gitlib.log(opts({ depth: 50 })); }
          catch (e) { return { out: "fatal: your current branch does not have any commits yet", ok: false }; }
          if (!commits.length) return { out: 'fatal: your current branch does not have any commits yet', ok: false };
          // isomorphic-git's log revisits shared history once per merge parent
          var logSeen = {};
          commits = commits.filter(function (c) {
            if (logSeen[c.oid]) return false;
            logSeen[c.oid] = true;
            return true;
          });
          var g = await graphModel();
          var refsByOid = {};
          g.commits.forEach(function (c) { if (c.refs.length) refsByOid[c.oid] = c.refs; });
          var outLines = [];
          commits.forEach(function (c) {
            var decor = refsByOid[c.oid]
              ? ' {y}(' + refsByOid[c.oid].map(function (r) { return r.isHead ? 'HEAD -> ' + r.name : r.name; }).join(', ') + '){/}'
              : '';
            if (oneline) {
              outLines.push('{y}' + c.oid.slice(0, 7) + '{/}' + decor + ' ' + c.commit.message.split('\n')[0]);
            } else {
              outLines.push('{y}commit ' + c.oid + '{/}' + decor);
              outLines.push('Author: ' + c.commit.author.name + ' <' + c.commit.author.email + '>');
              outLines.push('Date:   ' + gitDate(c.commit.author.timestamp, c.commit.author.timezoneOffset));
              outLines.push('');
              outLines.push('    ' + c.commit.message.split('\n')[0]);
              outLines.push('');
            }
          });
          return { out: outLines.join('\n'), ok: true };
        }

        case 'branch': {
          var del = rest.indexOf('-d') !== -1 || rest.indexOf('-D') !== -1;
          var names = rest.filter(function (a) { return a.charAt(0) !== '-'; });
          var all = await gitlib.listBranches(opts());
          var cur = await currentBranch();
          if (del) {
            if (!names.length) return { out: 'fatal: branch name required', ok: false };
            if (names[0] === cur) return { out: "error: cannot delete branch '" + names[0] + "' checked out at '" + displayDir + "'", ok: false };
            if (all.indexOf(names[0]) === -1) return { out: "error: branch '" + names[0] + "' not found.", ok: false };
            await gitlib.deleteBranch(opts({ ref: names[0] }));
            return { out: "Deleted branch " + names[0], ok: true };
          }
          if (!names.length) {
            if (!all.length) return { out: '', ok: true };
            return { out: all.map(function (b) { return b === cur ? '{g}* ' + b + '{/}' : '  ' + b; }).join('\n'), ok: true };
          }
          if (all.indexOf(names[0]) !== -1) return { out: "fatal: a branch named '" + names[0] + "' already exists", ok: false };
          try { await gitlib.branch(opts({ ref: names[0] })); }
          catch (e) { return { out: 'fatal: ' + e.message, ok: false }; }
          return { out: '', ok: true, silentNote: 'created branch ' + names[0] };
        }

        case 'switch':
        case 'checkout': {
          var create = rest.indexOf('-b') !== -1 || rest.indexOf('-c') !== -1;
          var names2 = rest.filter(function (a) { return a.charAt(0) !== '-'; });
          if (!names2.length) return { out: 'fatal: missing branch name', ok: false };
          var name = names2[0];
          var all2 = await gitlib.listBranches(opts());
          if (create) {
            if (all2.indexOf(name) !== -1) return { out: "fatal: a branch named '" + name + "' already exists", ok: false };
            await gitlib.branch(opts({ ref: name, checkout: true }));
            return { out: "Switched to a new branch '" + name + "'", ok: true };
          }
          if (all2.indexOf(name) === -1) {
            return { out: "error: pathspec '" + name + "' did not match any file(s) known to git\nhint: use `git checkout -b " + name + "` to create it", ok: false };
          }
          await gitlib.checkout(opts({ ref: name }));
          return { out: "Switched to branch '" + name + "'", ok: true };
        }

        case 'merge': {
          var theirs = rest.filter(function (a) { return a.charAt(0) !== '-'; })[0];
          if (!theirs) return { out: 'usage: git merge <branch>', ok: false };
          var ours = await currentBranch();
          var known = await gitlib.listBranches(opts());
          if (known.indexOf(theirs) === -1) return { out: "merge: " + theirs + " - not something we can merge", ok: false };
          if (theirs === ours) return { out: 'Already up to date.', ok: true };
          var result;
          try {
            result = await gitlib.merge(opts({
              ours: ours, theirs: theirs,
              author: { name: author.name, email: author.email },
              message: "Merge branch '" + theirs + "' into " + ours
            }));
          } catch (e) {
            if (e.code === 'MergeNotSupportedError' || e.code === 'MergeConflictError') {
              return {
                out: 'CONFLICT: both branches changed the same file.\n' +
                     'Automatic merge failed. In this sandbox, conflicts are not resolvable —\n' +
                     'try `reset` and take the guided path instead.',
                ok: false
              };
            }
            return { out: 'fatal: ' + e.message, ok: false };
          }
          // bring the working directory in line with the new ref
          await gitlib.checkout(opts({ ref: ours, force: true }));
          if (result.alreadyMerged) return { out: 'Already up to date.', ok: true };
          mergesDone.push({ from: theirs, into: ours });
          if (result.fastForward) return { out: 'Updating ' + (result.oid || '').slice(0, 7) + '\nFast-forward', ok: true };
          return { out: "Merge made by the 'recursive' strategy.", ok: true };
        }

        case 'remote': {
          if (rest[0] === 'add') {
            if (rest[1] !== 'origin' || !rest[2]) return { out: 'usage: git remote add origin <url>', ok: false };
            if (remoteUrl) return { out: 'error: remote origin already exists.', ok: false };
            await gitlib.init({ fs: fs, gitdir: remoteGitdir, bare: true, defaultBranch: defaultBranch });
            remoteUrl = rest[2];
            return { out: '', ok: true };
          }
          if (!rest.length) return { out: remoteUrl ? 'origin' : '', ok: true };
          if (rest[0] === '-v') {
            if (!remoteUrl) return { out: '', ok: true };
            return { out: 'origin\t' + remoteUrl + ' (fetch)\norigin\t' + remoteUrl + ' (push)', ok: true };
          }
          return { out: 'usage: git remote [-v] | git remote add origin <url>', ok: false };
        }

        case 'push': {
          if (!remoteUrl) return { out: 'fatal: No configured push destination.\nAdd a remote first: git remote add origin <url>', ok: false };
          var setUp = rest.indexOf('-u') !== -1 || rest.indexOf('--set-upstream') !== -1;
          var words = rest.filter(function (a) { return a.charAt(0) !== '-'; });
          if (words[0] && words[0] !== 'origin') return { out: "fatal: '" + words[0] + "' does not appear to be a git repository", ok: false };
          var pbr = words[1] || (await currentBranch());
          if (!pbr) return { out: 'fatal: you are not currently on a branch.', ok: false };
          var locals = await gitlib.listBranches(opts());
          if (locals.indexOf(pbr) === -1) return { out: 'error: src refspec ' + pbr + ' does not match any', ok: false };
          if (!words[1] && !upstreams[pbr]) {
            return {
              out: 'fatal: The current branch ' + pbr + ' has no upstream branch.\n' +
                   'To push the current branch and set the remote as upstream, use\n\n' +
                   '    git push -u origin ' + pbr,
              ok: false
            };
          }
          var localOid = await gitlib.resolveRef(opts({ ref: pbr }));
          var remoteOid = await remoteBranchOid(pbr);
          if (setUp) upstreams[pbr] = true;
          if (remoteOid === localOid) return { out: 'Everything up-to-date', ok: true };
          if (remoteOid) {
            // only fast-forward pushes are allowed, like a real remote
            var pushedSet = await reachableFrom(localOid, opts);
            if (!pushedSet[remoteOid]) {
              return {
                out: 'To ' + remoteUrl + '\n' +
                     ' {r}! [rejected]{/}        ' + pbr + ' -> ' + pbr + ' (fetch first)\n' +
                     'hint: Updates were rejected because the remote contains work that you do\n' +
                     'hint: not have locally. Pull the remote changes ({y}git pull{/}) before pushing again.',
                ok: false
              };
            }
          }
          await copyObjects(dir + '/.git', remoteGitdir);
          await fs.promises.mkdir(remoteGitdir + '/refs/heads', { recursive: true });
          await fs.promises.writeFile(remoteGitdir + '/refs/heads/' + pbr, localOid + '\n');
          await setTrackingRef(pbr, localOid);
          var pushOut = ['To ' + remoteUrl];
          pushOut.push(remoteOid
            ? '   ' + remoteOid.slice(0, 7) + '..' + localOid.slice(0, 7) + '  ' + pbr + ' -> ' + pbr
            : ' * [new branch]      ' + pbr + ' -> ' + pbr);
          if (setUp) pushOut.push("branch '" + pbr + "' set up to track 'origin/" + pbr + "'.");
          return { out: pushOut.join('\n'), ok: true };
        }

        case 'fetch': {
          if (!remoteUrl) return { out: "fatal: 'origin' does not appear to be a git repository", ok: false };
          var rnames = await listRemoteBranchNames();
          await copyObjects(remoteGitdir, dir + '/.git');
          var updated = [];
          for (var fi = 0; fi < rnames.length; fi++) {
            var rOid = await remoteBranchOid(rnames[fi]);
            var cur = null;
            try { cur = await gitlib.resolveRef(opts({ ref: 'refs/remotes/origin/' + rnames[fi] })); } catch (e) {}
            if (cur === rOid) continue;
            await setTrackingRef(rnames[fi], rOid);
            updated.push(cur
              ? '   ' + cur.slice(0, 7) + '..' + rOid.slice(0, 7) + '  ' + rnames[fi] + '       -> origin/' + rnames[fi]
              : ' * [new branch]      ' + rnames[fi] + '       -> origin/' + rnames[fi]);
          }
          if (!updated.length) return { out: '', ok: true };
          return { out: ['From ' + remoteUrl].concat(updated).join('\n'), ok: true };
        }

        case 'pull': {
          if (!remoteUrl) return { out: "fatal: 'origin' does not appear to be a git repository", ok: false };
          var lbr = await currentBranch();
          if (!lbr) return { out: 'fatal: you are not currently on a branch.', ok: false };
          var fetched = await gitCommand(['fetch']);
          var theirOid = await remoteBranchOid(lbr);
          if (!theirOid) return { out: "fatal: origin has no branch named '" + lbr + "' to pull from.", ok: false };
          var oursOid = await gitlib.resolveRef(opts({ ref: lbr }));
          var prefix2 = fetched.out ? fetched.out + '\n' : '';
          if (theirOid === oursOid) return { out: prefix2 + 'Already up to date.', ok: true };
          var pres;
          try {
            pres = await gitlib.merge(opts({
              ours: lbr, theirs: 'refs/remotes/origin/' + lbr,
              author: { name: author.name, email: author.email },
              message: "Merge branch '" + lbr + "' of " + remoteUrl
            }));
          } catch (e) {
            if (e.code === 'MergeNotSupportedError' || e.code === 'MergeConflictError') {
              return {
                out: prefix2 + 'CONFLICT: the remote changed the same lines you did.\n' +
                     'Automatic merge failed. In this sandbox, conflicts are not resolvable yet —\n' +
                     'try `reset` and take the guided path instead.',
                ok: false
              };
            }
            return { out: prefix2 + 'fatal: ' + e.message, ok: false };
          }
          await gitlib.checkout(opts({ ref: lbr, force: true }));
          if (pres.alreadyMerged) return { out: prefix2 + 'Already up to date.', ok: true };
          mergesDone.push({ from: 'origin/' + lbr, into: lbr });
          if (pres.fastForward) return { out: prefix2 + 'Updating ' + oursOid.slice(0, 7) + '..' + theirOid.slice(0, 7) + '\nFast-forward', ok: true };
          return { out: prefix2 + "Merge made by the 'recursive' strategy.", ok: true };
        }

        case 'diff': {
          // git diff            working tree  vs  staging area (index)
          // git diff --staged   staging area  vs  last commit
          var stagedD = rest.indexOf('--staged') !== -1 || rest.indexOf('--cached') !== -1;
          var unknownD = rest.filter(function (a) { return a.charAt(0) === '-' && a !== '--staged' && a !== '--cached' && a !== '--'; });
          if (unknownD.length) return { out: 'error: option `' + unknownD[0].replace(/^-+/, '') + "' is not supported in this sandbox\nhint: try  git diff  or  git diff --staged", ok: false };
          var pathsD = rest.filter(function (a) { return a.charAt(0) !== '-'; });
          return { out: await diffText(stagedD, pathsD), ok: true };
        }

        case 'restore': {
          // git restore <file>              working file  <- staging area
          // git restore --staged <file>     staging area  <- last commit
          // git restore --source=<c> <file> working file  <- commit <c>
          var S = false, W = false, source = null;
          var pathsR = [];
          for (var ri = 0; ri < rest.length; ri++) {
            var a = rest[ri];
            if (a === '--staged' || a === '-S') S = true;
            else if (a === '--worktree' || a === '-W') W = true;
            else if (a.indexOf('--source=') === 0) source = a.slice(9);
            else if (a === '--source' || a === '-s') source = rest[++ri];
            else if (a === '--') continue;
            else if (a.charAt(0) === '-') return { out: "error: unknown option `" + a.replace(/^-+/, '') + "'", ok: false };
            else pathsR.push(a);
          }
          if (!S) W = true;
          if (!pathsR.length) return { out: 'fatal: you must specify path(s) to restore', ok: false };
          var srcOid = null;
          if (source !== null) {
            srcOid = await resolveRev(source);
            if (!srcOid) return { out: "fatal: could not resolve " + source, ok: false };
          } else if (S) {
            srcOid = await headOid();
            if (!srcOid) return { out: 'fatal: could not resolve HEAD', ok: false };
          }
          var rowsR = await zoneRows();
          var srcMap = srcOid ? await treeMap(srcOid) : null;
          for (var pi = 0; pi < pathsR.length; pi++) {
            var spec2 = pathsR[pi];
            // candidate files: known to the source (or to the index when
            // restoring the working tree from it)
            var known2 = {};
            rowsR.forEach(function (r) {
              if (!matchesPath(r.file, spec2)) return;
              if (srcMap ? (r.file in srcMap || (S && r.index !== null)) : r.index !== null) known2[r.file] = r;
            });
            if (srcMap) Object.keys(srcMap).forEach(function (f) { if (matchesPath(f, spec2) && !known2[f]) known2[f] = { file: f }; });
            var filesR = Object.keys(known2).sort();
            if (!filesR.length) return { out: "error: pathspec '" + spec2 + "' did not match any file(s) known to git", ok: false };
            for (var fi2 = 0; fi2 < filesR.length; fi2++) {
              var fr = filesR[fi2];
              var wanted;   // blob id the target should end up with (null = absent)
              if (S) {
                wanted = srcMap && fr in srcMap ? srcMap[fr] : null;
                if (wanted === null) await gitlib.remove(opts({ filepath: fr }));
                else if (source === null) await gitlib.resetIndex(opts({ filepath: fr }));
                else {
                  // stage the source version without touching the working file
                  var keep = null;
                  try { keep = await fs.promises.readFile(abs(fr)); } catch (e) {}
                  await writeWork(fr, await readBlobText(wanted));
                  await gitlib.add(opts({ filepath: fr, force: true }));
                  if (keep === null) await fs.promises.unlink(abs(fr)); else await fs.promises.writeFile(abs(fr), keep);
                }
              }
              if (W) {
                if (srcMap) wanted = fr in srcMap ? srcMap[fr] : null;
                else wanted = known2[fr].index;
                if (wanted === null) { try { await fs.promises.unlink(abs(fr)); } catch (e) {} }
                else await writeWork(fr, await readBlobText(wanted));
              }
            }
          }
          return { out: '', ok: true };
        }

        case 'show': {
          var revS = rest.filter(function (a) { return a.charAt(0) !== '-'; })[0] || 'HEAD';
          var oidS = await resolveRev(revS);
          if (!oidS) {
            if ((await headOid()) === null) return { out: "fatal: your current branch 'main' does not have any commits yet", ok: false };
            return { out: "fatal: ambiguous argument '" + revS + "': unknown revision or path not in the working tree.", ok: false };
          }
          return { out: await showCommit(oidS), ok: true };
        }

        case 'help':
          return { out: usageGit(), ok: true };

        default:
          return { out: "git: '" + sub + "' is not supported in this sandbox.\n" + usageGit(), ok: false };
      }
    }

    // Line-by-line diff as data: [{ t: ' '|'+'|'-', text, a, b }] where a/b
    // are 1-based line numbers in the old/new file (absent on the other side).
    // Longest-common-subsequence alignment, so an edited line shows as one
    // "-" and one "+" at the right place, as in git. Files here are a few
    // dozen lines, so the quadratic table is tiny.
    function diffLines(oldTxt, newTxt) {
      var a = oldTxt === '' ? [] : oldTxt.split('\n');
      var b = newTxt === '' ? [] : newTxt.split('\n');
      var n = a.length, m = b.length;
      var L = [];
      for (var i = 0; i <= n; i++) { L.push(new Array(m + 1).fill(0)); }
      for (i = n - 1; i >= 0; i--) {
        for (var j = m - 1; j >= 0; j--) {
          L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
        }
      }
      var out = [];
      i = 0; j = 0;
      while (i < n || j < m) {
        if (i < n && j < m && a[i] === b[j]) { out.push({ t: ' ', text: a[i], a: i + 1, b: j + 1 }); i++; j++; }
        else if (i < n && (j >= m || L[i + 1][j] >= L[i][j + 1])) { out.push({ t: '-', text: a[i], a: i + 1 }); i++; }
        else { out.push({ t: '+', text: b[j], b: j + 1 }); j++; }
      }
      return out;
    }

    // Split text into lines the way git does: a final newline ends the last
    // line rather than starting an empty one.
    function gitLines(txt) {
      if (txt === null || txt === '') return { body: '', noEol: false };
      var noEol = txt.charAt(txt.length - 1) !== '\n';
      return { body: noEol ? txt : txt.slice(0, -1), noEol: noEol };
    }

    // One file's unified diff, as git prints it (3 lines of context, hunk
    // headers with the enclosing "function" line). oldTxt/newTxt are null
    // when the file is absent on that side.
    function unifiedDiff(file, oldTxt, newTxt, oldOid, newOid) {
      var head = ['{w}diff --git a/' + file + ' b/' + file + '{/}'];
      var zero = '0000000';
      if (oldTxt === null) {
        head.push('{w}new file mode 100644{/}', '{w}index ' + zero + '..' + newOid.slice(0, 7) + '{/}',
          '{w}--- /dev/null{/}', '{w}+++ b/' + file + '{/}');
      } else if (newTxt === null) {
        head.push('{w}deleted file mode 100644{/}', '{w}index ' + oldOid.slice(0, 7) + '..' + zero + '{/}',
          '{w}--- a/' + file + '{/}', '{w}+++ /dev/null{/}');
      } else {
        head.push('{w}index ' + oldOid.slice(0, 7) + '..' + newOid.slice(0, 7) + ' 100644{/}',
          '{w}--- a/' + file + '{/}', '{w}+++ b/' + file + '{/}');
      }
      var o = gitLines(oldTxt), nw = gitLines(newTxt);
      var ops = diffLines(o.body, nw.body);
      var oldAll = o.body === '' ? [] : o.body.split('\n');
      var CONTEXT = 3;
      // indexes of changed ops, grouped into hunks
      var changed = [];
      ops.forEach(function (op, k) { if (op.t !== ' ') changed.push(k); });
      var hunks = [];
      changed.forEach(function (k) {
        var last = hunks[hunks.length - 1];
        if (last && k - last.end <= 2 * CONTEXT) last.end = k;
        else hunks.push({ start: k, end: k });
      });
      var body = [];
      hunks.forEach(function (h) {
        var from = Math.max(0, h.start - CONTEXT);
        var to = Math.min(ops.length - 1, h.end + CONTEXT);
        var slice = ops.slice(from, to + 1);
        var aStart = 0, aLen = 0, bStart = 0, bLen = 0;
        slice.forEach(function (op) {
          if (op.t !== '+') { aLen++; if (!aStart) aStart = op.a; }
          if (op.t !== '-') { bLen++; if (!bStart) bStart = op.b; }
        });
        // an empty side is reported as the line *before* the hunk
        if (!aLen) aStart = firstLineBefore(ops, from, 'a');
        if (!bLen) bStart = firstLineBefore(ops, from, 'b');
        // git's default "function name": the last line before the hunk that
        // starts with a letter, "_" or "$"
        var fn = '';
        for (var q = (aLen ? aStart : aStart + 1) - 2; q >= 0; q--) {
          if (/^[A-Za-z_$]/.test(oldAll[q] || '')) { fn = ' ' + oldAll[q]; break; }
        }
        body.push('{b}@@ -' + range(aStart, aLen) + ' +' + range(bStart, bLen) + ' @@{/}' + fn);
        slice.forEach(function (op) {
          if (op.t === '+') body.push('{g}+' + op.text + '{/}');
          else if (op.t === '-') body.push('{r}-' + op.text + '{/}');
          else body.push(' ' + op.text);
        });
      });
      if (o.noEol && hunks.length) body.push('\\ No newline at end of file');
      return head.concat(body).join('\n');
    }

    function firstLineBefore(ops, from, side) {
      for (var k = from - 1; k >= 0; k--) if (ops[k][side]) return ops[k][side];
      return 0;
    }

    function range(start, len) {
      return len === 1 ? String(start) : start + ',' + len;
    }

    // Count "+" and "-" lines between two texts (for `git commit`'s summary).
    function countChanges(oldTxt, newTxt) {
      var ops = diffLines(gitLines(oldTxt).body, gitLines(newTxt).body);
      var ins = 0, del = 0;
      ops.forEach(function (op) { if (op.t === '+') ins++; else if (op.t === '-') del++; });
      return { ins: ins, del: del };
    }

    // Legacy whole-file rendering, kept for callers outside the diff command.
    function simpleDiff(oldTxt, newTxt) {
      return diffLines(oldTxt, newTxt).map(function (l) {
        if (l.t === '+') return '{g}+' + l.text + '{/}';
        if (l.t === '-') return '{r}-' + l.text + '{/}';
        return ' ' + l.text;
      }).join('\n');
    }

    // Text for a blob id (null stays null)
    async function textOf(oid) {
      return oid === null ? null : readBlobText(oid);
    }

    // `git diff` (working tree vs index) or `git diff --staged` (index vs
    // last commit), limited to `paths` when given.
    async function diffText(staged, paths) {
      var rows = await zoneRows();
      var chunks = [];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        if (paths.length && !paths.some(function (p) { return matchesPath(row.file, p); })) continue;
        var from = staged ? row.head : row.index;
        var to = staged ? row.index : row.work;
        if (!staged && row.index === null) continue;   // untracked: not in `git diff`
        if (from === to) continue;
        var toText = to === null ? null
          : (staged ? await readBlobText(to) : await fs.promises.readFile(dir + '/' + row.file, 'utf8'));
        chunks.push(unifiedDiff(row.file, await textOf(from), toText, from, to));
      }
      return chunks.join('\n');
    }

    // "scripts/" and "scripts" both match files under scripts/; "." matches all
    function matchesPath(file, spec) {
      var p = rel(spec).replace(/\/$/, '');
      if (spec === '.' || p === '') return true;
      return file === p || file.indexOf(p + '/') === 0;
    }

    // Working directory vs the last commit, structured for rendering:
    // { files: [{ file, kind: 'new'|'modified'|'deleted', lines: [...] }] }
    // or null when there is no repository yet.
    async function diffModel() {
      if (!(await isRepo())) return null;
      var rows = await zoneRows();
      var files = [];
      for (var r = 0; r < rows.length; r++) {
        var file = rows[r].file, head = rows[r].head, workdir = rows[r].work;
        if (head === workdir) continue;                       // unchanged or absent
        var kind = head === null ? 'new' : (workdir === null ? 'deleted' : 'modified');
        var oldTxt = '', newTxt = '';
        if (head !== null) oldTxt = await readBlobText(head);
        if (workdir !== null) newTxt = await fs.promises.readFile(dir + '/' + file, 'utf8');
        // Strip one trailing newline per side so the panel never shows a
        // phantom blank last line.
        oldTxt = oldTxt.replace(/\n$/, '');
        newTxt = newTxt.replace(/\n$/, '');
        var lines;
        if (kind === 'new') lines = newTxt.split('\n').map(function (t, k) { return { t: '+', text: t, b: k + 1 }; });
        else if (kind === 'deleted') lines = oldTxt.split('\n').map(function (t, k) { return { t: '-', text: t, a: k + 1 }; });
        else lines = diffLines(oldTxt, newTxt);
        files.push({ file: file, kind: kind, lines: lines });
      }
      return { files: files };
    }

    function usageGit() {
      return [
        'Supported git commands in this sandbox:',
        '  git init                      git status',
        '  git add <file> | .            git commit -m "message"',
        '  git log [--oneline]           git diff [--staged]',
        '  git show [<commit>]           git restore [--staged] <file>',
        '  git restore --source=<commit> <file>',
        '  git branch [name] [-d name]   git checkout [-b] <branch>',
        '  git switch [-c] <branch>      git merge <branch>',
        '  git remote add origin <url>   git push [-u origin <branch>]',
        '  git fetch                     git pull',
        '  git config user.name "..."'
      ].join('\n');
    }

    /* ------------------------- shell commands ---------------------- */

    async function shellCommand(cmd, args, redirect, target) {
      switch (cmd) {
        case 'ls': {
          var showAll = args.indexOf('-a') !== -1 || args.indexOf('-la') !== -1 || args.indexOf('-al') !== -1;
          var entries = await fs.promises.readdir(dir);
          if (!showAll) entries = entries.filter(function (e) { return e.charAt(0) !== '.'; });
          if (!entries.length) return { out: '', ok: true };
          var marked = [];
          for (var i = 0; i < entries.length; i++) {
            var s = await fs.promises.stat(dir + '/' + entries[i]);
            marked.push(s.isDirectory() ? '{b}' + entries[i] + '/{/}' : entries[i]);
          }
          return { out: marked.join('  '), ok: true };
        }
        case 'cat': {
          if (!args.length) return { out: 'usage: cat <file>', ok: false };
          try {
            var txt = await fs.promises.readFile(abs(args[0]), 'utf8');
            return { out: txt.replace(/\n$/, ''), ok: true };
          } catch (e) {
            return { out: 'cat: ' + args[0] + ': No such file or directory', ok: false };
          }
        }
        case 'echo': {
          var text = args.join(' ');
          if (redirect && target) {
            var p = abs(target);
            var prev = '';
            if (redirect === '>>') { try { prev = await fs.promises.readFile(p, 'utf8'); } catch (e) {} }
            await fs.promises.writeFile(p, prev + text + '\n');
            return { out: '', ok: true, silentNote: 'wrote ' + rel(target) };
          }
          return { out: text, ok: true };
        }
        case 'touch': {
          if (!args.length) return { out: 'usage: touch <file>', ok: false };
          for (var t = 0; t < args.length; t++) {
            var pt = abs(args[t]);
            try { await fs.promises.stat(pt); }
            catch (e) { await fs.promises.writeFile(pt, ''); }
          }
          return { out: '', ok: true, silentNote: 'touched ' + args.join(' ') };
        }
        case 'rm': {
          var files = args.filter(function (a) { return a.charAt(0) !== '-'; });
          if (!files.length) return { out: 'usage: rm <file>', ok: false };
          for (var r = 0; r < files.length; r++) {
            try { await fs.promises.unlink(abs(files[r])); }
            catch (e) { return { out: 'rm: ' + files[r] + ': No such file or directory', ok: false }; }
          }
          return { out: '', ok: true };
        }
        case 'mkdir': {
          if (!args.length) return { out: 'usage: mkdir <dir>', ok: false };
          await fs.promises.mkdir(abs(args[args.length - 1]), { recursive: true });
          return { out: '', ok: true };
        }
        case 'pwd':
          return { out: displayDir, ok: true };
        // Authoring helper for seeds: move the current branch back n commits
        // (first parent), so a previously-pushed commit exists only on the
        // remote — the "colleague pushed while you were away" setup.
        case 'rewind': {
          var back = parseInt(args[0] || '1', 10);
          if (!(back > 0)) return { out: 'usage: rewind <n>', ok: false };
          var rbr = await currentBranch();
          if (!rbr) return { out: 'rewind: not on a branch', ok: false };
          var roid = await gitlib.resolveRef(opts({ ref: rbr }));
          for (var rw = 0; rw < back; rw++) {
            var rc = await gitlib.readCommit(opts({ oid: roid }));
            var rp = rc.commit.parent || [];
            if (!rp.length) return { out: 'rewind: not enough history to rewind ' + back, ok: false };
            roid = rp[0];
          }
          await gitlib.writeRef(opts({ ref: 'refs/heads/' + rbr, value: roid, force: true }));
          // keep the tracking ref in step so the learner discovers the newer
          // remote commits with `git fetch`, not automatically
          try {
            await gitlib.resolveRef(opts({ ref: 'refs/remotes/origin/' + rbr }));
            await setTrackingRef(rbr, roid);
          } catch (e) { /* no tracking ref yet */ }
          await gitlib.checkout(opts({ ref: rbr, force: true }));
          return { out: '', ok: true, silentNote: 'rewound ' + rbr + ' by ' + back };
        }
        case 'whoami':
          return { out: author.name + ' <' + author.email + '>', ok: true };
        default:
          return null;
      }
    }

    /* ---------------------------- dispatch -------------------------- */

    async function run(line) {
      line = String(line || '').trim();
      if (!line) return { out: '', ok: true, kind: 'empty' };

      var tokens;
      try { tokens = tokenize(line); }
      catch (e) { return { out: 'sh: ' + e.message, ok: false, kind: 'error' }; }

      var parsed = splitRedirect(tokens);
      var args = parsed.args;
      var cmd = args[0];

      await ensureWorkdir();

      try {
        if (cmd === 'git') {
          var r = await gitCommand(args.slice(1));
          r.kind = 'git';
          return r;
        }
        var sh = await shellCommand(cmd, args.slice(1), parsed.redirect, parsed.target);
        if (sh) { sh.kind = 'shell'; return sh; }
        return {
          out: cmd + ': command not found\nType `help` to see what this sandbox supports.',
          ok: false, kind: 'error'
        };
      } catch (e) {
        return { out: 'error: ' + (e && e.message ? e.message : String(e)), ok: false, kind: 'error' };
      }
    }

    /* ------------------------- undo snapshots ------------------------ */

    // Everything a command can change lives in the in-memory store (working
    // files, .git, the bare mock remote) plus a few closure variables, so a
    // full state snapshot is a clone of both. Repos here are a few KB, so
    // cloning per command is cheap.
    function cloneStore(src) {
      var out = new Map();
      src.forEach(function (node, key) {
        var copy = {};
        for (var k in node) copy[k] = node[k];
        if (node.content instanceof Uint8Array) copy.content = new Uint8Array(node.content);
        out.set(key, copy);
      });
      return out;
    }

    function snapshot() {
      return {
        store: cloneStore(fs._store),
        remoteUrl: remoteUrl,
        upstreams: JSON.parse(JSON.stringify(upstreams)),
        merges: mergesDone.map(function (m) { return { from: m.from, into: m.into }; }),
        author: { name: author.name, email: author.email },
        repoReady: repoReady
      };
    }

    function restore(snap) {
      var cloned = cloneStore(snap.store);
      // mutate the existing store so every closure holding `fs` stays valid
      fs._store.clear();
      cloned.forEach(function (v, k) { fs._store.set(k, v); });
      remoteUrl = snap.remoteUrl;
      upstreams = JSON.parse(JSON.stringify(snap.upstreams));
      mergesDone = snap.merges.map(function (m) { return { from: m.from, into: m.into }; });
      author = { name: snap.author.name, email: snap.author.email };
      repoReady = snap.repoReady;
    }

    // Did anything meaningful change since the snapshot? Compares content,
    // not mtimes, so rewriting a file with identical bytes does not count.
    function changedSince(snap) {
      if (remoteUrl !== snap.remoteUrl) return true;
      if (mergesDone.length !== snap.merges.length) return true;
      if (JSON.stringify(upstreams) !== JSON.stringify(snap.upstreams)) return true;
      if (author.name !== snap.author.name || author.email !== snap.author.email) return true;
      if (fs._store.size !== snap.store.size) return true;
      var diff = false;
      fs._store.forEach(function (node, key) {
        if (diff) return;
        var old = snap.store.get(key);
        if (!old || old.type !== node.type) { diff = true; return; }
        var a = node.content, b = old.content;
        if (!a !== !b) { diff = true; return; }
        if (a && b) {
          if (a.length !== b.length) { diff = true; return; }
          for (var i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) { diff = true; return; }
          }
        }
      });
      return diff;
    }

    async function reset(seed) {
      fs = createMemFS();
      base.fs = fs;
      repoReady = false;
      remoteUrl = null;
      upstreams = {};
      mergesDone = [];
      author = { name: 'Your Name', email: 'you@example.com' };
      await ensureWorkdir();
      if (seed) await seed(api);
    }

    var api = {
      run: run,
      reset: reset,
      snapshot: snapshot,
      restore: restore,
      changedSince: changedSince,
      graphModel: graphModel,
      statusModel: statusModel,
      diffModel: diffModel,
      remoteModel: remoteModel,
      isRepo: isRepo,
      currentBranch: currentBranch,
      listFiles: listFiles,
      readFile: function (p) { return fs.promises.readFile(abs(p), 'utf8'); },
      writeFile: function (p, c) { return ensureWorkdir().then(function () { return writeWork(p, c); }); },
      fileVersions: fileVersions,
      headOid: headOid,
      // text of a file in a given commit, or null when absent there
      readAt: async function (oid, file) {
        if (!oid) return null;
        var m = await treeMap(oid);
        return file in m ? readBlobText(m[file]) : null;
      },
      zoneRows: zoneRows,
      isIgnored: isIgnored,
      get fs() { return fs; },
      get dir() { return dir; },
      git: gitlib
    };
    return api;
  }

  return {
    createSandbox: createSandbox,
    createMemFS: createMemFS,
    tokenize: tokenize,
    splitRedirect: splitRedirect
  };
});


/* ------------------------------------------------------------------
   The `when:` mini-language.

   Lesson authors describe what a learner must achieve as a condition on
   repository state rather than as JavaScript:

     when: repo
     when: commits >= 2
     when: commits on report >= 3
     when: branch report and on main
     when: merged report into main
     when: merge commit
     when: file report.qmd contains "Q3"
     when: ran /git\s+status/
     when: not clean

   compileWhen(src) returns a predicate (ctx) => boolean, or throws an Error
   with an author-facing message. Compilation happens once at mount time so
   mistakes surface immediately rather than on the learner's tenth command.
   ------------------------------------------------------------------ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GitSandboxWhen = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var KEYWORDS = ['and', 'or', 'not'];

  /* ------------------------------ tokenizer ------------------------------ */

  function tokenize(src) {
    var tokens = [];
    var i = 0;
    var n = src.length;
    while (i < n) {
      var c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(' || c === ')') { tokens.push({ t: c, v: c, at: i }); i++; continue; }
      if (c === '"' || c === "'") {
        var q = c, buf = '', start = i;
        i++;
        while (i < n && src[i] !== q) {
          if (src[i] === '\\' && i + 1 < n) { buf += src[i + 1]; i += 2; }
          else { buf += src[i]; i++; }
        }
        if (i >= n) throw new Error('unterminated string starting at character ' + (start + 1));
        i++;
        tokens.push({ t: 'str', v: buf, at: start });
        continue;
      }
      if (c === '/') {
        var rstart = i, rbuf = '';
        i++;
        while (i < n && src[i] !== '/') {
          if (src[i] === '\\' && i + 1 < n) { rbuf += src[i] + src[i + 1]; i += 2; }
          else { rbuf += src[i]; i++; }
        }
        if (i >= n) throw new Error('unterminated /regex/ starting at character ' + (rstart + 1));
        i++;
        var flags = '';
        while (i < n && /[a-z]/.test(src[i])) { flags += src[i]; i++; }
        tokens.push({ t: 'regex', v: rbuf, flags: flags, at: rstart });
        continue;
      }
      var opMatch = /^(>=|<=|==|=|>|<)/.exec(src.slice(i));
      if (opMatch) { tokens.push({ t: 'op', v: opMatch[1], at: i }); i += opMatch[1].length; continue; }
      var wordMatch = /^[^\s()]+/.exec(src.slice(i));
      if (!wordMatch) throw new Error('unexpected character ' + JSON.stringify(c));
      var w = wordMatch[0];
      if (/^\d+$/.test(w)) tokens.push({ t: 'num', v: parseInt(w, 10), at: i });
      else if (KEYWORDS.indexOf(w) !== -1) tokens.push({ t: w, v: w, at: i });
      else tokens.push({ t: 'word', v: w, at: i });
      i += w.length;
    }
    return tokens;
  }

  /* ------------------------------ predicates ----------------------------- */

  function ui() {
    return (typeof self !== 'undefined' && self.GitSandboxUI) || null;
  }
  function branchOid(ctx, name) {
    var b = (ctx.graph.branches || []).filter(function (x) { return x.name === name; })[0];
    return b ? b.oid : null;
  }
  function reaches(ctx, from, target) {
    if (!from || !target) return false;
    if (from === target) return true;
    var byOid = {};
    ctx.graph.commits.forEach(function (c) { byOid[c.oid] = c; });
    var stack = [from], seen = {};
    while (stack.length) {
      var oid = stack.pop();
      if (oid === target) return true;
      if (seen[oid]) continue;
      seen[oid] = true;
      var c = byOid[oid];
      if (c) (c.parents || []).forEach(function (p) { stack.push(p); });
    }
    return false;
  }
  function commitCount(ctx, name) {
    if (!name) return ctx.graph.commits.length;
    var tip = branchOid(ctx, name);
    if (!tip) return 0;
    var byOid = {};
    ctx.graph.commits.forEach(function (c) { byOid[c.oid] = c; });
    var stack = [tip], seen = {}, count = 0;
    while (stack.length) {
      var oid = stack.pop();
      if (seen[oid]) continue;
      seen[oid] = true;
      count++;
      var c = byOid[oid];
      if (c) (c.parents || []).forEach(function (p) { stack.push(p); });
    }
    return count;
  }
  function compare(op, left, right) {
    switch (op) {
      case '>=': return left >= right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '<': return left < right;
      case '==':
      case '=': return left === right;
    }
    return false;
  }

  /* -------------------------------- parser ------------------------------- */

  function parse(src) {
    var tokens = tokenize(src);
    var pos = 0;

    function peek(k) { return tokens[pos + (k || 0)]; }
    function next() { return tokens[pos++]; }
    function describe(tok) {
      if (!tok) return 'end of expression';
      return JSON.stringify(String(tok.v));
    }
    function expectWord(what) {
      var tok = peek();
      if (!tok || (tok.t !== 'word' && tok.t !== 'str' && tok.t !== 'num')) {
        throw new Error('expected ' + what + ' but found ' + describe(tok));
      }
      return String(next().v);
    }

    function parseOr() {
      var left = parseAnd();
      while (peek() && peek().t === 'or') {
        next();
        var right = parseAnd();
        left = (function (a, b) {
          return function (ctx) { return a(ctx) || b(ctx); };
        })(left, right);
      }
      return left;
    }

    function parseAnd() {
      var left = parseNot();
      while (peek() && peek().t === 'and') {
        next();
        var right = parseNot();
        left = (function (a, b) {
          return function (ctx) { return a(ctx) && b(ctx); };
        })(left, right);
      }
      return left;
    }

    function parseNot() {
      if (peek() && peek().t === 'not') {
        next();
        var inner = parseNot();
        return function (ctx) { return !inner(ctx); };
      }
      if (peek() && peek().t === '(') {
        next();
        var expr = parseOr();
        if (!peek() || peek().t !== ')') {
          throw new Error('missing closing parenthesis');
        }
        next();
        return expr;
      }
      return parsePredicate();
    }

    function parsePredicate() {
      var tok = peek();
      if (!tok) throw new Error('expression ended early; expected a condition');
      if (tok.t !== 'word') {
        throw new Error('expected a condition but found ' + describe(tok));
      }
      var word = String(next().v);

      switch (word) {
        case 'repo':
          return function (ctx) { return !!ctx.isRepo; };

        case 'clean':
          return function (ctx) {
            var s = ctx.status;
            return ctx.isRepo && s.staged.length === 0 && s.modified.length === 0 &&
                   s.untracked.length === 0 && s.deleted.length === 0 &&
                   s.stagedDeleted.length === 0;
          };

        case 'staged':
          return function (ctx) {
            return ctx.status.staged.length > 0 || ctx.status.stagedDeleted.length > 0;
          };

        case 'merge': {
          var m = peek();
          if (!m || String(m.v) !== 'commit') {
            throw new Error('expected "merge commit" but found "merge ' +
              (m ? String(m.v) : '') + '"');
          }
          next();
          return function (ctx) {
            return ctx.graph.commits.some(function (c) { return (c.parents || []).length > 1; });
          };
        }

        case 'commits': {
          var branch = null;
          if (peek() && peek().t === 'word' && String(peek().v) === 'on') {
            next();
            branch = expectWord('a branch name after "commits on"');
          }
          var op = '>=';
          if (peek() && peek().t === 'op') op = String(next().v);
          var numTok = peek();
          if (!numTok || numTok.t !== 'num') {
            throw new Error('expected a number after "commits' +
              (branch ? ' on ' + branch : '') + (op !== '>=' ? ' ' + op : '') +
              '" but found ' + describe(numTok));
          }
          next();
          var want = numTok.v;
          return function (ctx) { return compare(op, commitCount(ctx, branch), want); };
        }

        case 'branch': {
          var bname = expectWord('a branch name after "branch"');
          return function (ctx) {
            return (ctx.graph.branches || []).some(function (b) { return b.name === bname; });
          };
        }

        case 'on': {
          var onName = expectWord('a branch name after "on"');
          return function (ctx) { return ctx.graph.head === onName; };
        }

        case 'merged': {
          var from = expectWord('a branch name after "merged"');
          var into = peek();
          if (!into || String(into.v) !== 'into') {
            throw new Error('expected "merged ' + from + ' into <branch>" but found ' +
              describe(into) + ' after the branch name');
          }
          next();
          var target = expectWord('a branch name after "into"');
          // Ancestry alone would be trivially true the moment X is branched
          // off Y (X's tip is already an ancestor of Y's), so a real merge
          // must also have been recorded by the sandbox. The ancestry check
          // still matters: it goes false again if Y is later rewound past
          // the merge. When either branch no longer exists (deleted after
          // merging, or a remote-tracking name), the record alone decides.
          return function (ctx) {
            var recorded = (ctx.graph.merges || []).some(function (m) {
              return m.from === from && m.into === target;
            });
            if (!recorded) return false;
            var fromOid = branchOid(ctx, from);
            var intoOid = branchOid(ctx, target);
            if (!fromOid || !intoOid) return true;
            return reaches(ctx, intoOid, fromOid);
          };
        }

        case 'file': {
          var fname = expectWord('a filename after "file"');
          if (peek() && peek().t === 'word' && String(peek().v) === 'contains') {
            next();
            var needleTok = peek();
            if (!needleTok || (needleTok.t !== 'str' && needleTok.t !== 'word' && needleTok.t !== 'regex')) {
              throw new Error('expected text or /regex/ after "contains" but found ' + describe(needleTok));
            }
            next();
            if (needleTok.t === 'regex') {
              var fre = new RegExp(needleTok.v, needleTok.flags || '');
              return function (ctx) { return fre.test(ctx._fileText(fname)); };
            }
            var needle = String(needleTok.v);
            return function (ctx) { return ctx._fileText(fname).indexOf(needle) !== -1; };
          }
          return function (ctx) { return ctx.files.indexOf(fname) !== -1; };
        }

        case 'remote':
          return function (ctx) { return !!ctx.remote; };

        // true once the current branch's latest commit is on the remote
        case 'pushed':
          return function (ctx) {
            return !!(ctx.remote && ctx.remote.tracked && ctx.remote.ahead === 0);
          };

        case 'ran': {
          var rTok = peek();
          if (!rTok || (rTok.t !== 'regex' && rTok.t !== 'str' && rTok.t !== 'word')) {
            throw new Error('expected /regex/ or "text" after "ran" but found ' + describe(rTok));
          }
          next();
          if (rTok.t === 'regex') {
            var re = new RegExp(rTok.v, rTok.flags || '');
            return function (ctx) { return (ctx.history || []).some(function (h) { return re.test(h); }); };
          }
          var text = String(rTok.v);
          return function (ctx) {
            return (ctx.history || []).some(function (h) { return h.indexOf(text) !== -1; });
          };
        }

        default:
          throw new Error('unknown condition "' + word + '". Available: repo, clean, staged, ' +
            'commits, commits on <branch>, branch <name>, on <branch>, merged <a> into <b>, ' +
            'merge commit, file <name> [contains "text"], ran /regex/, remote, pushed');
      }
    }

    var fn = parseOr();
    if (pos < tokens.length) {
      throw new Error('unexpected ' + describe(peek()) + ' after a complete condition');
    }
    return fn;
  }

  /* -------------------------------- public ------------------------------- */

  function compileWhen(src) {
    if (typeof src !== 'string' || src.trim() === '') {
      throw new Error('`when:` is empty');
    }
    var fn;
    try {
      fn = parse(src);
    } catch (e) {
      throw new Error('cannot read `when: ' + src + '` — ' + e.message);
    }
    return function (ctx) {
      // `file ... contains` needs file contents, which are async; the UI
      // pre-loads them into ctx._files before evaluating.
      return fn(ctx);
    };
  }

  // Which filenames does this expression need the contents of? The UI reads
  // them before evaluating so predicates can stay synchronous.
  function filesNeeded(src) {
    var out = [];
    try {
      var tokens = tokenize(src);
      for (var i = 0; i < tokens.length - 2; i++) {
        if (tokens[i].t === 'word' && String(tokens[i].v) === 'file' &&
            tokens[i + 2] && tokens[i + 2].t === 'word' && String(tokens[i + 2].v) === 'contains') {
          out.push(String(tokens[i + 1].v));
        }
      }
    } catch (e) { /* compileWhen will report it */ }
    return out;
  }

  function compileJs(src) {
    var body = /(^|[\s;{])return[\s(]/.test(src) ? src : 'return (' + src + ');';
    try {
      /* eslint-disable no-new-func */
      var fn = new Function('c', body);
      return function (ctx) { return fn(ctx); };
    } catch (e) {
      throw new Error('cannot compile `js:` block — ' + e.message);
    }
  }

  return { compileWhen: compileWhen, compileJs: compileJs, filesNeeded: filesNeeded, tokenize: tokenize };
});


/* ------------------------------------------------------------------
   git sandbox UI: terminal + staging diagram + commit graph.
   Depends on window.GitSandboxCore and window.git (isomorphic-git UMD).
   ------------------------------------------------------------------ */
(function (root) {
  'use strict';

  var LANE_COLORS = ['#447099', '#419599', '#72994E', '#9A4665', '#EE6331', '#3276B5'];

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // {g} green {r} red {y} yellow {b} blue {w} bold {/} reset
  function markup(s) {
    var map = { g: 'tg', r: 'tr', y: 'ty', b: 'tb', w: 'tw' };
    var out = esc(s);
    out = out.replace(/\{([grybw])\}/g, function (_m, k) { return '<span class="' + map[k] + '">'; });
    out = out.replace(/\{\/\}/g, '</span>');
    return out;
  }

  /* --------------------- config normalisation ------------------------ */

  // Authors can describe a task three ways:
  //   check: async (c) => ...     a JavaScript predicate (hand-written qmd)
  //   when:  'commits >= 2'       the declarative mini-language (extension)
  //   js:    'c.isRepo'           an escape hatch for the extension
  // Normalise all three to a `check` function, recording any compile error so
  // it can be shown in place instead of failing silently.
  function normaliseTasks(tasks) {
    var W = root.GitSandboxWhen;
    return (tasks || []).map(function (t) {
      var task = { text: t.text, _done: false, _error: null, _files: [] };
      if (typeof t.check === 'function') {
        task.check = t.check;
        return task;
      }
      if (!W) {
        task._error = 'the `when:` compiler is not loaded';
        task.check = function () { return false; };
        return task;
      }
      try {
        if (typeof t.when === 'string' && t.when.trim() !== '') {
          task._files = W.filesNeeded(t.when);
          var pred = W.compileWhen(t.when);
          task.check = function (ctx) { return pred(ctx); };
        } else if (typeof t.js === 'string' && t.js.trim() !== '') {
          var jsPred = W.compileJs(t.js);
          task.check = function (ctx) { return jsPred(ctx); };
        } else {
          throw new Error('a task needs one of `when:`, `js:` or a `check` function');
        }
      } catch (e) {
        task._error = e.message;
        task.check = function () { return false; };
      }
      return task;
    });
  }

  // `seed` may be a function or a block of commands from YAML.
  function normaliseSeed(seed) {
    if (!seed) return null;
    if (typeof seed === 'function') return seed;
    var lines = String(seed).split('\n')
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l !== '' && l.charAt(0) !== '#'; });
    if (!lines.length) return null;
    return async function (sb) {
      for (var i = 0; i < lines.length; i++) {
        var r = await sb.run(lines[i]);
        if (!r.ok) {
          // A broken seed is an authoring bug, so make it loud rather than
          // leaving the learner in a half-built repository.
          throw new Error('seed command failed: ' + lines[i] + ' — ' + String(r.out).split('\n')[0]);
        }
      }
    };
  }

  function normaliseIntro(intro) {
    if (!intro) return [];
    if (Array.isArray(intro)) return intro;
    return String(intro).replace(/\n$/, '').split('\n');
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* --------------------------- commit graph -------------------------- */

  function renderGraph(svg, model) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var NS = 'http://www.w3.org/2000/svg';

    // Draw at the SVG's real pixel width so nothing overflows sideways; the
    // graph never needs a horizontal scrollbar.
    var W = svg.clientWidth || 640;

    if (!model.commits.length) {
      svg.setAttribute('viewBox', '0 0 ' + W + ' 60');
      svg.setAttribute('height', '60');
      var t = document.createElementNS(NS, 'text');
      t.setAttribute('x', String(W / 2)); t.setAttribute('y', '34');
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'gs-empty-text');
      t.textContent = 'No commits yet.';
      svg.appendChild(t);
      return;
    }

    var rowH = 44, laneW = 24, padTop = 26, padLeft = 22, lineH = 17;
    var maxLane = 0;
    model.commits.forEach(function (c) { if (c.lane > maxLane) maxLane = c.lane; });
    var graphW = padLeft + maxLane * laneW + 22;

    // Wrap a commit message to a character budget, breaking on spaces and
    // hard-breaking any single word longer than the line.
    function wrapWords(text, maxChars) {
      var words = String(text).split(/\s+/), lines = [], cur = '';
      words.forEach(function (w) {
        if (!cur) cur = w;
        else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
        else { lines.push(cur); cur = w; }
      });
      if (cur) lines.push(cur);
      var out = [];
      lines.forEach(function (l) {
        while (l.length > maxChars) { out.push(l.slice(0, maxChars)); l = l.slice(maxChars); }
        out.push(l);
      });
      return out.length ? out : [''];
    }

    // First pass: place refs/sha/message per row and measure the wrapped height.
    var rows = model.commits.map(function (c) {
      var tx = graphW + 6;
      var refLayouts = (c.refs || []).map(function (r) {
        var label = (r.isHead ? 'HEAD → ' : '') + r.name;
        var w = label.length * 6.6 + 14;
        var lay = { label: label, x: tx, w: w, isHead: r.isHead, remote: r.remote };
        tx += w + 6;
        return lay;
      });
      var shaX = tx, msgX = tx + 62;
      var maxChars = Math.max(8, Math.floor((W - msgX - 12) / 6.8));
      var lines = wrapWords(c.message, maxChars);
      return { refLayouts: refLayouts, shaX: shaX, msgX: msgX, lines: lines,
               h: Math.max(rowH, lines.length * lineH + 20) };
    });

    // Second pass: stack rows so a wrapped message never overlaps the next.
    var tops = [], acc = padTop;
    rows.forEach(function (r) { tops.push(acc); acc += r.h; });
    var height = acc + 6;

    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + height);
    svg.setAttribute('height', String(height));
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');

    var index = {};
    model.commits.forEach(function (c, i) { index[c.oid] = i; });
    var x = function (lane) { return padLeft + lane * laneW; };
    var cyOf = function (i) { return tops[i] + 16; };

    // edges first so nodes sit on top
    model.commits.forEach(function (c, i) {
      (c.parents || []).forEach(function (p, pi) {
        if (!(p in index)) return;
        var j = index[p];
        var x1 = x(c.lane), y1 = cyOf(i), x2 = x(model.commits[j].lane), y2 = cyOf(j);
        var path = document.createElementNS(NS, 'path');
        var d;
        if (x1 === x2) {
          d = 'M' + x1 + ',' + y1 + ' L' + x2 + ',' + y2;
        } else {
          var mid = y1 + (y2 - y1) * 0.55;
          d = 'M' + x1 + ',' + y1 + ' C' + x1 + ',' + mid + ' ' + x2 + ',' + (y2 - (y2 - y1) * 0.45) + ' ' + x2 + ',' + y2;
        }
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', LANE_COLORS[(pi === 0 ? c.lane : model.commits[j].lane) % LANE_COLORS.length]);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('opacity', '0.55');
        svg.appendChild(path);
      });
    });

    model.commits.forEach(function (c, i) {
      var cx = x(c.lane), cy = cyOf(i), row = rows[i];
      var isMerge = (c.parents || []).length > 1;

      var circle = document.createElementNS(NS, 'circle');
      circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
      circle.setAttribute('r', isMerge ? 7 : 6);
      circle.setAttribute('fill', isMerge ? '#FFFFFF' : LANE_COLORS[c.lane % LANE_COLORS.length]);
      circle.setAttribute('stroke', LANE_COLORS[c.lane % LANE_COLORS.length]);
      circle.setAttribute('stroke-width', isMerge ? '3' : '2');
      svg.appendChild(circle);

      // ref pills
      row.refLayouts.forEach(function (rl) {
        var rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', rl.x); rect.setAttribute('y', cy - 10);
        rect.setAttribute('width', rl.w); rect.setAttribute('height', 20);
        rect.setAttribute('rx', 10);
        rect.setAttribute('fill', rl.isHead ? '#447099' : (rl.remote ? '#E7E9EC' : '#D0DBE5'));
        svg.appendChild(rect);
        var lt = document.createElementNS(NS, 'text');
        lt.setAttribute('x', rl.x + 7); lt.setAttribute('y', cy + 4);
        lt.setAttribute('class', rl.isHead ? 'gs-ref gs-ref-head' : (rl.remote ? 'gs-ref gs-ref-remote' : 'gs-ref'));
        lt.textContent = rl.label;
        svg.appendChild(lt);
      });

      var sha = document.createElementNS(NS, 'text');
      sha.setAttribute('x', row.shaX); sha.setAttribute('y', cy + 4);
      sha.setAttribute('class', 'gs-sha');
      sha.textContent = c.short;
      svg.appendChild(sha);

      var msg = document.createElementNS(NS, 'text');
      msg.setAttribute('y', cy + 4);
      msg.setAttribute('class', 'gs-msg');
      row.lines.forEach(function (line, li) {
        var ts = document.createElementNS(NS, 'tspan');
        ts.setAttribute('x', row.msgX);
        ts.setAttribute('dy', li === 0 ? '0' : String(lineH));
        ts.textContent = line;
        msg.appendChild(ts);
      });
      svg.appendChild(msg);
    });
  }

  /* ------------------------------ diff panel ------------------------- */

  function renderDiff(node, model) {
    if (!model) {
      node.innerHTML = '<div class="gs-diff-empty">Nothing is tracked yet — run <code>git init</code> to start.</div>';
      return;
    }
    if (!model.files.length) {
      node.innerHTML = '<div class="gs-diff-empty">Working directory clean — no changes since the last commit.</div>';
      return;
    }
    node.innerHTML = model.files.map(function (f) {
      var rows = f.lines.map(function (l) {
        var cls = l.t === '+' ? ' gs-diff-add' : (l.t === '-' ? ' gs-diff-del' : '');
        return '<div class="gs-diff-line' + cls + '">' +
          '<span class="gs-diff-num">' + (l.a || '') + '</span>' +
          '<span class="gs-diff-num">' + (l.b || '') + '</span>' +
          '<span class="gs-diff-sign">' + (l.t === ' ' ? '' : l.t) + '</span>' +
          '<span class="gs-diff-text">' + esc(l.text) + '</span>' +
        '</div>';
      }).join('');
      return '<div class="gs-diff-file">' +
        '<div class="gs-diff-filehead">' +
          '<span class="gs-diff-name">' + esc(f.file) + '</span>' +
          '<span class="gs-diff-kind gs-diff-kind-' + f.kind + '">' + f.kind + '</span>' +
        '</div>' + rows +
      '</div>';
    }).join('');
  }

  /* -------------------------- staging diagram ------------------------ */

  function renderStages(node, status, graph, files, isRepo) {
    var needAdd = []
      .concat(status.untracked.map(function (f) { return { f: f, k: 'untracked' }; }))
      .concat(status.modified.map(function (f) { return { f: f, k: 'modified' }; }))
      .concat(status.deleted.map(function (f) { return { f: f, k: 'deleted' }; }));
    var staged = status.staged.map(function (s) { return { f: s.file, k: s.kind }; })
      .concat(status.stagedDeleted.map(function (f) { return { f: f, k: 'deleted' }; }));

    // Files with no git status still need to be visible: committed-and-clean
    // files after init, and every file before it. Before `git init` they are
    // just files — calling them "untracked" would use a git-status word while
    // no git status exists yet — so they render as quiet grey chips either way.
    var accounted = {};
    needAdd.concat(staged).forEach(function (it) { accounted[it.f] = true; });
    var clean = (files || [])
      .filter(function (f) { return !accounted[f]; })
      .map(function (f) { return { f: f, k: isRepo ? 'unchanged' : 'not in git yet' }; });

    function col(title, note, items, kind) {
      var chips = items.length
        ? items.map(function (it) {
            var quiet = it.k === 'unchanged' || it.k === 'not in git yet';
            var cls = 'gs-chip gs-chip-' + kind + (quiet ? ' gs-chip-clean' : '');
            return '<span class="' + cls + '">' + esc(it.f) +
                   '<span class="gs-chip-k">' + esc(it.k) + '</span></span>';
          }).join('')
        : '<span class="gs-chip gs-chip-empty">empty</span>';
      return '<div class="gs-col">' +
             '<div class="gs-col-h">' + esc(title) + '</div>' +
             '<div class="gs-col-n">' + esc(note) + '</div>' +
             '<div class="gs-chips">' + chips + '</div></div>';
    }

    var nCommits = graph.commits.length;
    var repoItems = nCommits
      ? [{ f: nCommits + ' commit' + (nCommits === 1 ? '' : 's'), k: graph.head || 'detached' }]
      : [];

    node.innerHTML =
      col('Working directory', 'what you edit', needAdd.concat(clean), 'work') +
      '<div class="gs-arrow"><span>git add</span><i class="gs-arrow-g">→</i></div>' +
      col('Staging area', 'what goes in next commit', staged, 'stage') +
      '<div class="gs-arrow"><span>git commit</span><i class="gs-arrow-g">→</i></div>' +
      col('Repository', 'permanent history', repoItems, 'repo');
  }

  /* ------------------------------- mount ----------------------------- */

  function mount(selector, config) {
    config = config || {};
    var host = typeof selector === 'string' ? document.querySelector(selector) : selector;
    if (!host) return null;

    if (!root.git || typeof root.git.init !== 'function') {
      host.classList.add('gs');
      host.innerHTML = '<div class="gs-loading">This exercise could not start: the git library did not load. ' +
        'Check that isomorphic-git.bundle.js is reachable from this page.</div>';
      return null;
    }
    if (typeof root.Buffer === 'undefined') {
      // isomorphic-git's index code calls a global Buffer. The bundle shipped with
      // this lesson provides one; a bare CDN copy of isomorphic-git does not.
      host.classList.add('gs');
      host.innerHTML = '<div class="gs-loading">This exercise could not start: no Buffer polyfill is present. ' +
        'Load isomorphic-git.bundle.js (which includes one) rather than isomorphic-git on its own.</div>';
      return null;
    }

    var sb = root.GitSandboxCore.createSandbox({
      git: root.git,
      displayDir: (config.prompt || '~/project').replace(/\s*\$\s*$/, '')
    });
    var history = [];
    var histIdx = -1;
    var busy = false;
    var tasks = normaliseTasks(config.tasks);
    var seed = normaliseSeed(config.seed);
    var intro = normaliseIntro(config.intro);

    host.classList.add('gs');
    host.innerHTML =
      '<div class="gs-head">' +
        '<span class="gs-eyebrow">' + esc(config.title || 'Git sandbox') + '</span>' +
        '<span class="gs-state" role="status"></span>' +
        '<button type="button" class="gs-undo" disabled>Undo</button>' +
        '<button type="button" class="gs-reset">Reset</button>' +
      '</div>' +
      '<div class="gs-body">' +
        '<div class="gs-term-wrap">' +
          '<div class="gs-out" role="log" aria-live="polite" aria-label="Terminal output"></div>' +
          '<form class="gs-input-row" autocomplete="off">' +
            '<label class="gs-prompt" for="' + (host.id || 'gs') + '-in">' + esc(config.prompt || '~/project $') + '</label>' +
            '<input class="gs-input" id="' + (host.id || 'gs') + '-in" type="text" spellcheck="false"' +
            ' autocapitalize="off" autocorrect="off" aria-label="Type a git command"' +
            ' placeholder="type a command and press Enter">' +
          '</form>' +
          '<div class="gs-hints"></div>' +
        '</div>' +
        '<div class="gs-tasks"></div>' +
        '<div class="gs-viz">' +
          // One panel at a time; each tab carries a live badge so the folded
          // panels still tell you what they hold at a glance.
          '<div class="gs-tabs" role="tablist" aria-label="Repository views">' +
            '<button type="button" class="gs-tab is-active" role="tab" aria-selected="true" data-tab="files">Files<span class="gs-tab-badge" hidden></span></button>' +
            '<button type="button" class="gs-tab" role="tab" aria-selected="false" data-tab="changes">Changes<span class="gs-tab-badge" hidden></span></button>' +
            '<button type="button" class="gs-tab" role="tab" aria-selected="false" data-tab="history">History<span class="gs-tab-badge" hidden></span></button>' +
            '<button type="button" class="gs-tab" role="tab" aria-selected="false" data-tab="remote" hidden>Remote<span class="gs-tab-badge" hidden></span></button>' +
          '</div>' +
          '<section class="gs-panel" role="tabpanel" data-panel="files">' +
            '<div class="gs-stages"></div>' +
          '</section>' +
          '<section class="gs-panel" role="tabpanel" data-panel="changes" hidden>' +
            '<div class="gs-diff"></div>' +
          '</section>' +
          '<section class="gs-panel" role="tabpanel" data-panel="history" hidden>' +
            '<div class="gs-graph-scroll"><svg class="gs-graph" xmlns="http://www.w3.org/2000/svg"></svg></div>' +
          '</section>' +
          '<section class="gs-panel" role="tabpanel" data-panel="remote" hidden>' +
            '<div class="gs-remote" hidden>' +
              '<div class="gs-graph-scroll"><svg class="gs-remote-graph" xmlns="http://www.w3.org/2000/svg"></svg></div>' +
              '<div class="gs-remote-sync"></div>' +
            '</div>' +
          '</section>' +
        '</div>' +
      '</div>';

    var out = host.querySelector('.gs-out');
    var form = host.querySelector('.gs-input-row');
    var input = host.querySelector('.gs-input');
    var hintsNode = host.querySelector('.gs-hints');
    var stagesNode = host.querySelector('.gs-stages');
    var diffNode = host.querySelector('.gs-diff');
    var svg = host.querySelector('.gs-graph');
    var remoteWrap = host.querySelector('.gs-remote');
    var remoteSvg = host.querySelector('.gs-remote-graph');
    var remoteSync = host.querySelector('.gs-remote-sync');
    var tasksNode = host.querySelector('.gs-tasks');
    var stateNode = host.querySelector('.gs-state');
    var resetBtn = host.querySelector('.gs-reset');
    var undoBtn = host.querySelector('.gs-undo');
    var lastStateHtml = '';

    // Undo is full time travel: each entry restores the repo, the task
    // ticks, the command history and the terminal together, so the undone
    // command leaves no trace anywhere. Only commands that actually changed
    // state get an entry, so `undo` never appears to do nothing.
    var undoStack = [];
    var UNDO_DEPTH = 20;

    function captureUndo(line) {
      return {
        line: line,
        core: sb.snapshot(),
        outHtml: out.innerHTML,
        prompt: host.querySelector('.gs-prompt').textContent,
        histLen: history.length,
        done: tasks.map(function (t) { return !!t._done; })
      };
    }

    function doUndo() {
      var entry = undoStack.pop();
      if (!entry) {
        write('<span class="gs-echo-prompt">' +
          esc(host.querySelector('.gs-prompt').textContent) + '</span> undo', 'gs-echo');
        writeText('Nothing to undo.');
        return;
      }
      sb.restore(entry.core);
      out.innerHTML = entry.outHtml;
      history.length = entry.histLen;
      histIdx = history.length;
      tasks.forEach(function (t, i) { t._done = entry.done[i]; t._wasDone = entry.done[i]; });
      write('<span class="gs-echo-prompt">' + esc(entry.prompt) + '</span> undo', 'gs-echo');
      writeText('Undid: {y}' + entry.line + '{/}');
    }

    /* ------------------------------ tabs ------------------------------ */

    var tabButtons = {};
    var tabPanels = {};
    host.querySelectorAll('.gs-tab').forEach(function (b) { tabButtons[b.getAttribute('data-tab')] = b; });
    host.querySelectorAll('.gs-panel').forEach(function (p) { tabPanels[p.getAttribute('data-panel')] = p; });
    var activeTab = 'files';

    function selectTab(name) {
      if (!tabButtons[name] || tabButtons[name].hidden) return;
      activeTab = name;
      Object.keys(tabButtons).forEach(function (k) {
        var on = k === name;
        tabButtons[k].classList.toggle('is-active', on);
        tabButtons[k].setAttribute('aria-selected', on ? 'true' : 'false');
        tabPanels[k].hidden = !on;
      });
      // A graph drawn while its panel was hidden used the fallback width;
      // now that it has a real width, redraw at it.
      redrawGraph();
    }

    Object.keys(tabButtons).forEach(function (k) {
      tabButtons[k].addEventListener('click', function () { selectTab(k); });
    });

    function setBadge(name, text) {
      var badge = tabButtons[name].querySelector('.gs-tab-badge');
      badge.hidden = !text;
      badge.textContent = text || '';
      badge.classList.toggle('gs-tab-badge-ok', text === '✓');
    }

    // Which tab would a learner look at after this command? Mirrors the
    // glance they'd make anyway; a manual tab click holds until the next
    // command that has an opinion.
    function tabFor(line) {
      var t = line.trim().split(/\s+/);
      var c = t[0], s = t[1] || '';
      if (c === 'git') {
        if (/^(init|add|rm|status|restore|mv)$/.test(s)) return 'files';
        if (s === 'diff') return 'changes';
        if (/^(commit|merge|log|branch|checkout|switch)$/.test(s)) return 'history';
        if (/^(push|pull|fetch|remote)$/.test(s)) return 'remote';
        return null;
      }
      if (/^(echo|touch|rm|mkdir)$/.test(c)) return 'files';
      return null;
    }

    // The graph is drawn at the SVG's current pixel width, so a later resize
    // would scale it like an image (tiny text on narrow screens). Redraw the
    // last model whenever the width actually changes.
    var lastGraph = null;
    var lastGraphW = 0;
    var lastRemoteGraph = null;
    var lastRemoteGraphW = 0;
    function redrawGraph() {
      var w = svg.clientWidth;
      if (lastGraph && w && w !== lastGraphW) {
        lastGraphW = w;
        renderGraph(svg, lastGraph);
      }
      var rw = remoteSvg.clientWidth;
      if (lastRemoteGraph && rw && rw !== lastRemoteGraphW) {
        lastRemoteGraphW = rw;
        renderGraph(remoteSvg, lastRemoteGraph);
      }
    }
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(redrawGraph).observe(svg.parentNode);
    } else {
      root.addEventListener('resize', redrawGraph);
    }

    function write(html, cls) {
      var line = el('div', 'gs-line' + (cls ? ' ' + cls : ''), html);
      out.appendChild(line);
      out.scrollTop = out.scrollHeight;
    }
    function writeText(text, cls) {
      if (text === '' || text == null) return;
      write(markup(text), cls);
    }

    function renderHints() {
      var hints = config.hints || [];
      if (!hints.length) { hintsNode.innerHTML = ''; return; }
      hintsNode.innerHTML = '<span class="gs-hints-label">Try:</span>';
      hints.forEach(function (h) {
        var b = el('button', 'gs-hint', esc(h));
        b.type = 'button';
        b.addEventListener('click', function () { input.value = h; input.focus(); });
        hintsNode.appendChild(b);
      });
    }

    function renderTasks() {
      if (!tasks.length) { tasksNode.innerHTML = ''; return; }
      var done = 0;
      var rows = tasks.map(function (t) {
        if (t._error) {
          return '<li class="gs-task gs-task-broken">' +
                 '<span class="gs-task-mark" aria-hidden="true">!</span>' +
                 '<span class="gs-task-txt">' + t.text +
                 '<span class="gs-task-err">Authoring error: ' + esc(t._error) + '</span></span></li>';
        }
        var ok = !!t._done;
        if (ok) done++;
        // A task that ticked on this render gets a brief highlight, so the
        // completion registers even while the eye is on the terminal.
        var fresh = ok && !t._wasDone;
        t._wasDone = ok;
        return '<li class="gs-task' + (ok ? ' is-done' : '') + (fresh ? ' is-just-done' : '') + '">' +
               '<span class="gs-task-mark" aria-hidden="true">' + (ok ? '✓' : '') + '</span>' +
               '<span class="gs-task-txt">' + t.text + '</span></li>';
      }).join('');
      var broken = tasks.some(function (t) { return !!t._error; });
      var all = !broken && done === tasks.length;
      var note = config.doneNote || 'That is the whole exercise.';
      tasksNode.innerHTML =
        '<div class="gs-tasks-h">Your turn <span class="gs-count">' + done + ' of ' + tasks.length + '</span></div>' +
        '<ul class="gs-task-list">' + rows + '</ul>' +
        (all ? '<div class="gs-done">' + note + '</div>' : '');
    }

    async function refresh() {
      var graph = await sb.graphModel();
      var isRepo = await sb.isRepo();
      var status = isRepo ? await sb.statusModel()
        : { staged: [], modified: [], untracked: [], deleted: [], stagedDeleted: [] };
      var files = await sb.listFiles();
      var diff = await sb.diffModel();
      renderStages(stagesNode, status, graph, files, isRepo);
      renderDiff(diffNode, diff);
      renderGraph(svg, graph);
      lastGraph = graph;
      lastGraphW = svg.clientWidth;

      var remote = await sb.remoteModel();
      if (remote) {
        remoteWrap.hidden = false;
        renderGraph(remoteSvg, remote.graph);
        lastRemoteGraph = remote.graph;
        lastRemoteGraphW = remoteSvg.clientWidth;
        remoteSync.innerHTML = remoteSyncText(remote);
      } else {
        remoteWrap.hidden = true;
        lastRemoteGraph = null;
        remoteSync.innerHTML = '';
      }

      // Tab badges: enough signal that folded panels lose nothing you would
      // catch at a glance. A count means "something here"; ✓ means clean.
      var changed = status.untracked.length + status.modified.length +
        status.deleted.length + status.staged.length + status.stagedDeleted.length;
      setBadge('files', isRepo ? (changed ? String(changed) : '✓')
        : (files.length ? String(files.length) : ''));
      setBadge('changes', !isRepo ? '' : (diff && diff.files.length ? String(diff.files.length) : '✓'));
      setBadge('history', graph.commits.length ? String(graph.commits.length) : '');
      tabButtons.remote.hidden = !remote;
      if (remote) {
        setBadge('remote', !remote.tracked ? ''
          : (!remote.ahead && !remote.behind) ? '✓'
          : ((remote.ahead ? '⇡' + remote.ahead : '') +
             (remote.ahead && remote.behind ? ' ' : '') +
             (remote.behind ? '⇣' + remote.behind : '')));
      } else if (activeTab === 'remote') {
        selectTab('files');
      }

      var stateHtml = !isRepo
        ? '<span class="gs-state-pill gs-state-none">○ no repository</span>'
        : '<span class="gs-state-pill gs-state-repo">● repository</span>' +
          (remote ? '<span class="gs-state-pill gs-state-remote">⇄ origin</span>' : '');
      // role="status" announces DOM changes, so only touch it on a real change.
      if (stateHtml !== lastStateHtml) {
        stateNode.innerHTML = stateHtml;
        lastStateHtml = stateHtml;
      }

      // `file x contains "y"` needs file contents; read them up front so the
      // compiled predicates can stay synchronous.
      var contents = {};
      for (var f = 0; f < tasks.length; f++) {
        for (var g = 0; g < (tasks[f]._files || []).length; g++) {
          var name = tasks[f]._files[g];
          if (name in contents) continue;
          try { contents[name] = await sb.readFile(name); }
          catch (e) { contents[name] = ''; }
        }
      }

      var ctx = {
        sb: sb, graph: graph, status: status, files: files,
        history: history, isRepo: isRepo, remote: remote,
        _fileText: function (name) { return contents[name] || ''; }
      };
      for (var i = 0; i < tasks.length; i++) {
        if (tasks[i]._done || tasks[i]._error) continue;
        try { tasks[i]._done = !!(await tasks[i].check(ctx)); }
        catch (e) { tasks[i]._done = false; }
      }
      renderTasks();

      undoBtn.disabled = !undoStack.length;

      var br = graph.head;
      var promptText = (config.prompt || '~/project') .replace(/\s*\$\s*$/, '');
      host.querySelector('.gs-prompt').textContent =
        promptText + (br ? ' (' + br + ')' : '') + ' $';
    }

    async function submit(line) {
      if (busy) return;
      busy = true;
      input.disabled = true;
      var trimmed = line.trim();
      if (trimmed === 'undo') {
        // never reaches the engine: undo is a sandbox affordance, not git
        doUndo();
        await refresh();
        input.disabled = false;
        busy = false;
        input.focus();
        return;
      }
      var snap = captureUndo(line);
      write('<span class="gs-echo-prompt">' + esc(host.querySelector('.gs-prompt').textContent) + '</span> ' + esc(line), 'gs-echo');
      history.push(line);
      histIdx = history.length;
      var r = await sb.run(line);
      if (trimmed === 'clear') { out.innerHTML = ''; }
      else if (trimmed === 'help') { writeText(helpText()); }
      else if (trimmed === 'reset') { await doReset(); }
      else { writeText(r.out, r.ok ? '' : 'gs-err'); }
      if (r.ok && trimmed !== 'reset' && sb.changedSince(snap.core)) {
        undoStack.push(snap);
        if (undoStack.length > UNDO_DEPTH) undoStack.shift();
      }
      await refresh();
      if (r.ok) {
        var want = tabFor(line);
        if (want) selectTab(want);
      }
      input.disabled = false;
      busy = false;
      input.focus();
    }

    // one-line summary under the remote graph: how the learner's current
    // branch compares to its counterpart on the remote
    function remoteSyncText(r) {
      if (!r.branch || !r.tracked) return '';
      var b = esc(r.branch);
      var n = function (k) { return k + ' commit' + (k === 1 ? '' : 's'); };
      if (!r.ahead && !r.behind) return '✓ in sync with your <code>' + b + '</code>';
      if (r.ahead && r.behind) return '<code>origin/' + b + '</code> and your <code>' + b + '</code> have diverged — <code>git pull</code>, then <code>git push</code>';
      if (r.behind) return '<code>origin/' + b + '</code> is ' + n(r.behind) + ' ahead of your <code>' + b + '</code> — <code>git pull</code> to update';
      return 'your <code>' + b + '</code> is ' + n(r.ahead) + ' ahead — <code>git push</code> to publish';
    }

    function helpText() {
      return [
        '{w}This sandbox runs real git{/} (isomorphic-git) on a repo that lives only in this page.',
        '',
        '{y}git{/}    init, status, add, commit -m, log [--oneline], diff,',
        '       branch [-d], checkout [-b], switch [-c], merge, config,',
        '       remote add origin, push [-u], pull, fetch',
        '{y}shell{/}  ls, cat, echo "text" > file, echo "text" >> file, touch, rm, mkdir, pwd',
        '{y}other{/}  help, clear, reset, undo',
        '',
        '{y}undo{/} takes back your last state-changing command (a sandbox',
        'nicety, not a git command — real git has no undo).'
      ].join('\n');
    }

    async function doReset() {
      out.innerHTML = '';
      input.value = '';
      // Tasks checked with `ran "..."` read the command history, so it has to
      // go too or they re-complete themselves on the very next refresh.
      history.length = 0;
      histIdx = 0;
      undoStack.length = 0;
      tasks.forEach(function (t) { t._done = false; t._wasDone = false; });
      selectTab('files');
      try {
        await sb.reset(seed);
      } catch (e) {
        writeText('{r}This exercise could not be set up: ' + e.message + '{/}', 'gs-err');
        await refresh();
        return;
      }
      intro.forEach(function (l) { writeText(l); });
      await refresh();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = input.value;
      input.value = '';
      if (!v.trim()) return;
      submit(v);
    });

    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp') {
        if (!history.length) return;
        e.preventDefault();
        histIdx = Math.max(0, histIdx - 1);
        input.value = history[histIdx] || '';
      } else if (e.key === 'ArrowDown') {
        if (!history.length) return;
        e.preventDefault();
        histIdx = Math.min(history.length, histIdx + 1);
        input.value = history[histIdx] || '';
      }
    });

    resetBtn.addEventListener('click', function () { doReset(); });
    undoBtn.addEventListener('click', function () { submit('undo'); });
    host.querySelector('.gs-out').addEventListener('click', function () { input.focus(); });

    renderHints();
    var ready = doReset();

    return { sandbox: sb, refresh: refresh, run: submit, ready: ready, tasks: tasks };
  }

  /* ------------------- helpers for exercise checks ------------------- */

  // oid a branch currently points at, or null
  function branchOid(graph, name) {
    var b = (graph.branches || []).filter(function (x) { return x.name === name; })[0];
    return b ? b.oid : null;
  }

  // is `target` reachable by walking parents back from `from`?
  function reaches(graph, from, target) {
    if (!from || !target) return false;
    if (from === target) return true;
    var byOid = {};
    graph.commits.forEach(function (c) { byOid[c.oid] = c; });
    var stack = [from];
    var seen = {};
    while (stack.length) {
      var oid = stack.pop();
      if (oid === target) return true;
      if (seen[oid]) continue;
      seen[oid] = true;
      var c = byOid[oid];
      if (c) (c.parents || []).forEach(function (p) { stack.push(p); });
    }
    return false;
  }

  // Has branch `name` been merged into branch `into`? Requires a merge the
  // sandbox actually recorded, not just ancestry — a branch freshly created
  // from `into`'s tip is already an ancestor of it, and a completed
  // fast-forward merge leaves the identical graph, so ancestry alone cannot
  // tell the two apart.
  function isMerged(graph, name, into) {
    var recorded = (graph.merges || []).some(function (m) {
      return m.from === name && m.into === into;
    });
    if (!recorded) return false;
    var fromOid = branchOid(graph, name);
    var intoOid = branchOid(graph, into);
    if (!fromOid || !intoOid) return true;
    return reaches(graph, intoOid, fromOid);
  }

  // how many commits are reachable from a branch tip
  function commitCount(graph, name) {
    var tip = branchOid(graph, name);
    if (!tip) return 0;
    var byOid = {};
    graph.commits.forEach(function (c) { byOid[c.oid] = c; });
    var stack = [tip], seen = {}, n = 0;
    while (stack.length) {
      var oid = stack.pop();
      if (seen[oid]) continue;
      seen[oid] = true; n++;
      var c = byOid[oid];
      if (c) (c.parents || []).forEach(function (p) { stack.push(p); });
    }
    return n;
  }

  function hasMergeCommit(graph) {
    return graph.commits.some(function (c) { return (c.parents || []).length > 1; });
  }

  function boot() {
    var pending = root.__gsPending || [];
    pending.forEach(function (p) { mount(p[0], p[1]); });
    root.__gsPending = { push: function (p) { mount(p[0], p[1]); } };
  }

  root.GitSandboxUI = {
    mount: mount,
    boot: boot,
    // shared with the workbench (sandbox-workbench.js)
    esc: esc,
    markup: markup,
    branchOid: branchOid,
    reaches: reaches,
    isMerged: isMerged,
    commitCount: commitCount,
    hasMergeCommit: hasMergeCommit
  };
})(window);


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
    // shown once per visit, above the first mission's intro.
    var welcomed = false;
    function writeWelcome(lines) {
      var box = el('div', 'gw-welcome');
      box.setAttribute('role', 'note');
      box.setAttribute('aria-label', 'Message d\'accueil');
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
      if (!welcomed && cfg.welcome && cfg.welcome.length) {
        welcomed = true;
        writeWelcome(cfg.welcome);
      }
      (m.def.intro ? m.def.intro(lang) : []).forEach(function (l) { writeText(l, 'gw-note'); });
      busy = false;
      await refresh({ skipChecks: true });
      var first = m.def.open ? m.def.open(lang) : null;
      if (first) await openFile(first, { silent: true });
      renderMissionState();
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
