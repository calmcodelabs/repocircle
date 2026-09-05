// Stale-chunk recovery. After a deploy, a CDN- or browser-cached index.html can
// reference a hashed asset that a later deploy purged (404), so the module never
// runs and #app stays empty — a blank page. This detects that and reloads once with
// a cache-busting query, forcing a fresh index.html. Stable filename so even an old
// cached HTML can load it. CSP-clean (same-origin 'self', no inline). The M7 service
// worker will supersede this with a proper network-first HTML strategy.
(function () {
  var KEY = 'rc.staleReload';
  window.addEventListener('load', function () {
    setTimeout(function () {
      var app = document.getElementById('app');
      if (app && app.children.length > 0) {
        try {
          sessionStorage.removeItem(KEY);
        } catch {
          /* storage unavailable — nothing to clear */
        }
        return;
      }
      try {
        if (sessionStorage.getItem(KEY)) return; // already retried once this session
        sessionStorage.setItem(KEY, '1');
      } catch {
        /* storage unavailable — fall through to a single reload attempt */
      }
      var u = new URL(location.href);
      u.searchParams.set('_', Date.now().toString());
      location.replace(u.toString());
    }, 3000);
  });
})();
