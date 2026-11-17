window.selectKaiaTab = (name) => {
  document.body.classList.toggle('widget-tab', name === 'widget');
  document.body.classList.toggle(
    'feature-tab',
    ['reader', 'sr', 'alerts', 'studio', 'guide'].includes(name),
  );
  for (const tab of ['chat', 'widget', 'reader', 'sr', 'alerts', 'studio', 'guide']) {
    document
      .getElementById('tab-' + tab)
      ?.setAttribute('aria-pressed', String(tab === name));
    if (tab !== 'chat') {
      const panel = document.getElementById(tab + '-panel');
      if (panel) panel.hidden = tab !== name;
    }
  }
};
(() => {
  const el = (id) => document.getElementById(id);
  function tab(widget) {
    window.selectKaiaTab(widget ? 'widget' : 'chat');
  }
  el('tab-chat').onclick = () => tab(false);
  el('tab-widget').onclick = () => tab(true);
  el('tab-guide').onclick = () => window.selectKaiaTab('guide');
  for (const button of document.querySelectorAll('[data-guide-tab]')) {
    button.onclick = () => window.selectKaiaTab(button.dataset.guideTab);
  }
  window.kaia.on('settings', (s) => {
    if (s.restore) tab(false);
  });
  window.kaia.load().then((s) => {
    el('widget-url').value = s.widgetUrl;
    el('widget-preview').src = s.widgetUrl + '?preview=1';
    el('widget-layout').value = s.widget.layout;
    el('widget-font').value = s.widget.fontSize;
    el('widget-css').value = s.widget.css;
    for (const key of ['html', 'gap', 'radius', 'accent'])
      el('widget-' + key).value = s.widget[key];
  });
  el('copy-widget').onclick = async () => {
    await window.kaia.copyWidget();
    el('widget-status').textContent =
      'URL copiada. No OBS, use Fonte de navegador e fundo transparente.';
  };
  el('popup-widget').onclick = () => window.kaia.popupWidget();
  const draft = () => ({
    layout: el('widget-layout').value,
    fontSize: Number(el('widget-font').value),
    css: el('widget-css').value,
    html: el('widget-html').value,
    gap: Number(el('widget-gap').value),
    radius: Number(el('widget-radius').value),
    accent: el('widget-accent').value,
  });
  const preview = () =>
    el('widget-preview').contentWindow.postMessage(
      { type: 'kaia-chat-preview', widget: draft() },
      new URL(el('widget-url').value).origin,
    );
  for (const key of [
    'layout',
    'font',
    'css',
    'html',
    'gap',
    'radius',
    'accent',
  ])
    el('widget-' + key).addEventListener('input', preview);
  el('widget-starter').onclick = () => {
    el('widget-html').value =
      '<header><span data-slot="platform"></span><strong data-slot="user"></strong></header><section data-slot="message"></section>';
    preview();
  };
  el('save-widget').onclick = async () => {
    try {
      const s = await window.kaia.saveWidget({
        ...draft(),
        layout: el('widget-layout').value,
        fontSize: el('widget-font').value,
        css: el('widget-css').value,
      });
      el('widget-font').value = s.widget.fontSize;
      el('widget-status').textContent =
        'Widget salvo. Prévia e OBS atualizados.';
    } catch (error) {
      el('widget-status').textContent = error.message;
    }
  };
})();
