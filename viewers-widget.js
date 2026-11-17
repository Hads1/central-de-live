(() => {
  const selected =
    new URLSearchParams(location.search).get('platform') || 'all';
  const root = document.getElementById('viewer-counter');
  async function poll() {
    try {
      const r = await fetch('viewers-data', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw Error();
      const s = await r.json();
      if (s.enabled) window.renderViewers(root, s, selected);
      else root.replaceChildren();
    } catch {
      root.textContent = 'Contador desconectado';
    }
    setTimeout(poll, 5000);
  }
  poll();
})();
