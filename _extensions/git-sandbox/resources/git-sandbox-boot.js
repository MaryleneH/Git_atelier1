/* Drains the queue of exercises the Quarto filter pushed onto the page,
   and of ateliers (workbenches) the page itself registered.
   Loaded after body, once, by the git-sandbox extension. */
(function () {
  if (window.GitSandboxUI && typeof window.GitSandboxUI.boot === 'function') {
    window.GitSandboxUI.boot();
  }
  if (window.GitSandboxWorkbench && typeof window.GitSandboxWorkbench.boot === 'function') {
    window.GitSandboxWorkbench.boot();
  }
})();
