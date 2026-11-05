// Applies the saved theme and reading direction before the first paint, so the page never
// flashes the wrong colours or flips from left-to-right to right-to-left.
(function () {
  var root = document.documentElement;
  var lang = '';
  try {
    var s = JSON.parse(localStorage.getItem('rightpart.settings') || '{}');
    if (s.theme === 'light' || s.theme === 'dark') root.setAttribute('data-theme', s.theme);
    lang = s.lang || '';
  } catch (e) { /* storage blocked: follow the system theme */ }
  if (!lang) lang = (navigator.language || 'en').toLowerCase();
  var base = lang.split(/[-_]/)[0];
  if (/^(ar|he|iw|fa|ur|ps|yi|dv|ckb|sd|ug)$/.test(base)) root.setAttribute('dir', 'rtl');
})();
