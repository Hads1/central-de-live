(() => {
  const labels = {
    loading: 'Atualizando',
    offline: 'Offline',
    unavailable: 'Indisponível',
    disabled: 'Desativado',
  };
  window.renderViewers = (root, snapshot, selected = 'all') => {
    root.replaceChildren();
    root.style.fontSize = (snapshot.fontSize || 18) + 'px';
    root.style.color = snapshot.color || '#ffffff';
    const rows =
      selected === 'all'
        ? snapshot.rows
        : selected === 'total'
          ? []
          : snapshot.rows.filter((r) => r.platform === selected);
    function card(name, value, platform, logo, detail) {
      const item = document.createElement('div');
      item.className = 'viewer-card';
      item.dataset.platform = platform;
      item.title = detail;
      const icon = document.createElement('span');
      icon.className = 'viewer-icon';
      if (logo || ['twitch', 'kick', 'starvios'].includes(platform)) {
        const img = document.createElement('img');
        img.alt = name;
        img.referrerPolicy = 'no-referrer';
        img.src =
          logo ||
          'assets/counters/' +
            platform +
            (platform === 'starvios' ? '.png' : '.svg');
        img.onerror = () => {
          icon.textContent = name.slice(0, 1);
        };
        icon.append(img);
      } else icon.textContent = platform === 'total' ? 'Σ' : name.slice(0, 1);
      const label = document.createElement('span');
      label.className = 'viewer-label';
      label.textContent = name;
      const number = document.createElement('strong');
      number.className = 'viewer-number';
      number.textContent = value;
      item.append(icon, label, number);
      root.append(item);
    }
    for (const row of rows)
      card(
        row.name,
        Number.isSafeInteger(row.count) ? row.count.toLocaleString() : '—',
        row.platform,
        row.logo,
        `${row.channel} · ${labels[row.state] || 'Ao vivo'}${row.error ? ' · ' + row.error : ''}`,
      );
    if (
      snapshot.rows.length &&
      (selected === 'total' ||
        (selected === 'all' && snapshot.showTotal !== false))
    )
      card(
        snapshot.partial ? 'Total parcial' : 'Total',
        snapshot.total === null ? '—' : snapshot.total.toLocaleString(),
        'total',
        '',
        'Soma das plataformas disponíveis; não representa pessoas únicas.',
      );
    root.setAttribute(
      'aria-label',
      snapshot.partial
        ? 'Contadores: total parcial, há plataformas sem dados'
        : 'Contadores de espectadores',
    );
  };
})();
