const stage = document.getElementById('alert');
const events = new EventSource('events');
const audioOnly = location.pathname.includes('/alert-audio/');
let active;
let timeout;

function clear() {
  clearTimeout(timeout);
  active = null;
  const player = stage.querySelector('audio, video');
  if (player) {
    player.pause();
    player.removeAttribute('src');
    player.load();
  }
  stage.replaceChildren();
}

events.onmessage = ({ data }) => {
  const alert = JSON.parse(data);
  if (active && active === alert?.id) return;
  clear();
  if (!alert || alert.endsAt <= Date.now()) return;
  active = alert.id;
  timeout = setTimeout(clear, alert.endsAt - Date.now());

  if (audioOnly) {
    const player = document.createElement('audio');
    const finish = (outcome) => {
      if (active !== alert.id) return;
      clear();
      void fetch('finish/' + encodeURIComponent(alert.id) + '/' + outcome, { method: 'POST' }).catch(() => {});
    };
    player.volume = Math.min(1, Math.max(0, alert.volume / 100));
    player.onended = () => finish('ended');
    player.onerror = () => finish('error');
    stage.append(player);
    player.src = 'media/' + encodeURIComponent(alert.id);
    void player.play().catch(() => finish('error'));
    return;
  }

  if (alert.type === 'audio') {
    const label = document.createElement('span');
    label.textContent = alert.title || 'Resgate do canal';
    stage.append(label);
    return;
  }
  const player = document.createElement(alert.type === 'video' ? 'video' : 'img');
  const clearCurrent = () => {
    if (active === alert.id) clear();
  };
  if (player instanceof HTMLVideoElement) {
    player.muted = true;
    player.autoplay = true;
    player.playsInline = true;
  } else player.alt = '';
  player.onerror = clearCurrent;
  player.src = 'media/' + encodeURIComponent(alert.id);
  stage.append(player);
};
