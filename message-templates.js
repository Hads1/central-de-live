const DEFINITIONS = {
  sr: { label: 'SR — música adicionada no chat', text: '♪ Música adicionada à playlist: {musica} · Pedido de {usuario}', enabled: true, variables: ['usuario', 'musica'] },
  srVoice: { label: 'SR — aviso falado pelo leitor', text: '{usuario} pediu {musica}.', enabled: true, variables: ['usuario', 'musica'] },
  redemption: { label: 'Resgate — mensagem no chat da Central', text: 'resgatou {recompensa} · {pontos} pontos', enabled: true, variables: ['usuario', 'recompensa', 'pontos', 'plataforma'] },
  srControl: { label: 'SR — comando executado (resposta no canal)', text: '{usuario}, comando {comando} executado.', enabled: false, variables: ['usuario', 'comando'] },
  srVote: { label: 'SR — votação para pular (resposta no canal)', text: '{usuario} votou para pular: {votos}/{necessarios}.', enabled: false, variables: ['usuario', 'votos', 'necessarios'] },
  srError: { label: 'SR — erro no comando (resposta no canal)', text: '{usuario}: {erro}', enabled: false, variables: ['usuario', 'erro'] },
  follow: { label: 'Novo seguidor — modelo compartilhado', text: '{usuario}, obrigado por seguir o nosso canal!', enabled: false, variables: ['usuario', 'canal', 'plataforma'] },
  subscription: { label: 'Inscrição ou membro — modelo compartilhado', text: '{usuario}, obrigado pela inscrição no canal!', enabled: false, variables: ['usuario', 'canal', 'plataforma'] },
};
function render(text, values = {}) {
  return text.replace(/\{([a-z_]+)\}/gi, (token, key) => String(values[key.toLowerCase()] ?? token)).replace(/[\r\n]+/g, ' ').slice(0, 500);
}
function snapshot(state) {
  return Object.entries(DEFINITIONS).map(([id, definition]) => ({ id, ...definition, ...state.messageTemplates?.[id], variables: definition.variables }));
}
function message(state, id, values) {
  const template = snapshot(state).find((item) => item.id === id);
  return template?.enabled ? render(template.text, values) : '';
}
function validate(rows) {
  if (!Array.isArray(rows) || rows.length !== Object.keys(DEFINITIONS).length || new Set(rows.map(x => x.id)).size !== rows.length) throw Error('Modelos de mensagem inválidos.');
  return Object.fromEntries(rows.map(({ id, text, enabled }) => {
    const definition = DEFINITIONS[id];
    if (!Object.hasOwn(DEFINITIONS, id) || typeof text !== 'string' || !text.trim() || text.length > 500) throw Error('Preencha cada mensagem com até 500 caracteres.');
    for (const match of text.matchAll(/\{([^{}]+)\}/g)) if (!definition.variables.includes(match[1])) throw Error('Variável desconhecida: ' + match[0]);
    return [id, { text: text.trim(), enabled: Boolean(enabled) }];
  }));
}
module.exports = { DEFINITIONS, render, snapshot, message, validate };
