const test = require('node:test');
const assert = require('node:assert/strict');
const { snapshot, message, validate } = require('./message-templates');

test('mensagens editadas substituem variáveis sem executar conteúdo e respeitam desativação', () => {
  const rows = snapshot({});
  Object.assign(rows.find(x => x.id === 'sr'), {text: 'Entrou na fila: {musica}! Obrigado, {usuario}.'});
  Object.assign(rows.find(x => x.id === 'follow'), {enabled: true, text: '{usuario}, bem-vindo ao {canal}!'});
  const state = JSON.parse(JSON.stringify({messageTemplates: validate(rows)}));
  assert.equal(message(state, 'sr', {musica: 'Minha música', usuario: 'João'}), 'Entrou na fila: Minha música! Obrigado, João.');
  assert.equal(message(state, 'follow', {usuario: 'Ana', canal: 'Canal'}), 'Ana, bem-vindo ao Canal!');
  assert.equal(message(state, 'srControl', {}), '');
  assert.equal(message(state, 'sr', {musica: '{usuario}', usuario: 'João'}), 'Entrou na fila: {usuario}! Obrigado, João.');
  assert.throws(() => validate(rows.map(x => x.id === 'sr' ? {...x, text: '{senha}'} : x)), /Variável desconhecida/);
  assert.throws(() => validate(rows.slice(1)), /inválidos/);
});
