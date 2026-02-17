(function () {
  function stripTrailingSlash(value) {
    return String(value || '').trim().replace(/\/$/, '');
  }

  function isLocalHost(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1';
  }

  function resolveLeadApiBase() {
    var localOverride = stripTrailingSlash(localStorage.getItem('lead_api_base_override') || '');
    if (localOverride) return localOverride;

    var explicit = stripTrailingSlash((window.APP_CONFIG && window.APP_CONFIG.leadApiBase) || window.LEAD_API_BASE || '');
    if (explicit) return explicit;

    if (isLocalHost(window.location.hostname)) {
      return 'http://localhost:8787';
    }

    // Production default: same-origin API. Point a reverse proxy at your backend if needed.
    return stripTrailingSlash(window.location.origin);
  }

  window.resolveLeadApiBase = resolveLeadApiBase;
})();
