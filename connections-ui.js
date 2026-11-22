(() => {
  const el = id => document.getElementById(id);
  async function activityState() {
    const state = await window.kaia.studio('activityState');
    el('activity-connections-status').textContent = 'Twitch: ' + state.twitch + ' | Kick: ' + state.kick + ' | Starvios: ' + state.starvios.status + ' | YouTube: ' + state.youtube;
    el('activity-kick-receiver').textContent = 'Receptor local Kick: ' + state.kickReceiver;
  }
  for (const [id, action] of [['activity-starvios-connect', 'connectStarviosActivity'], ['activity-starvios-disconnect', 'disconnectStarviosActivity'], ['activity-kick-subscribe', 'subscribeKickActivity']]) {
    el(id).onclick = async () => { el(id).disabled = true; try { const result = await window.kaia.studio(action); el('activity-action-status').textContent = result || 'Configuração aplicada. Confira o status da conexão.'; await activityState(); } catch(error) {el('activity-action-status').textContent = error.message;} finally {el(id).disabled = false;} };
  }
  void activityState().catch(e => el('activity-action-status').textContent = e.message);
  setInterval(() => { if (!el('studio-panel').hidden) void activityState().catch(e => el('activity-action-status').textContent = e.message); }, 5000);
})();
