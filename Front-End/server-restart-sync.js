(function () {
  var STORAGE_KEY = '__secondgear_server_boot_id__';

  async function syncServerRestart() {
    try {
      var response = await fetch('/server-boot-id', { cache: 'no-store' });
      if (!response.ok) return;

      var data = await response.json();
      var currentBootId = data && data.bootId ? String(data.bootId) : '';
      if (!currentBootId) return;

      var previousBootId = localStorage.getItem(STORAGE_KEY);
      if (previousBootId && previousBootId !== currentBootId) {
        localStorage.clear();
      }

      localStorage.setItem(STORAGE_KEY, currentBootId);
    } catch (e) {
      // Ignore sync errors; app should still work offline or during startup.
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncServerRestart);
  } else {
    syncServerRestart();
  }
})();
