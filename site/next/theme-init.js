// Runs before first paint (plain script, not a module) so the page never flashes the wrong theme.
(function () {
  var stored = null;
  try { stored = localStorage.getItem('aistack.theme'); } catch (e) { /* storage blocked */ }
  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', stored === 'light' || stored === 'dark' ? stored : (dark ? 'dark' : 'light'));
})();
