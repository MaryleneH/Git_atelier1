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
