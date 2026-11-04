// Applies the saved theme before the first paint, so the page never flashes the wrong colours.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('rightpart.settings') || '{}');
    if (s.theme === 'light' || s.theme === 'dark') document.documentElement.setAttribute('data-theme', s.theme);
  } catch (e) { /* storage blocked: follow the system theme */ }
})();
