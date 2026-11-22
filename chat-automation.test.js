const test = require('node:test');
const assert = require('node:assert/strict');
const { ChatAutomation } = require('./chat-automation');

test('temporizador respeita intervalo, destinos, pausa e dados antigos', async () => {
  let time = 100000;
  const store = { state: { commands: [{ id: 'original' }] }, save(value) { this.state = value; } };
  const sent = [];
  const chat = new ChatAutomation({ store, now: () => time, send: async (...args) => sent.push(args),
    control: async () => {}, isOwner: () => false, report: () => {} });
  chat.saveTimer({ name: 'Aviso', message: 'Olá', minutes: 1, targets: ['twitch', 'kick'], enabled: true });
  await chat.tick();
  assert.equal(sent.length, 0);
  time += 60000;
  await chat.tick();
  assert.deepEqual(sent, [['twitch', 'Olá'], ['kick', 'Olá']]);
  assert.deepEqual(store.state.commands, [{ id: 'original' }]);
  const timer = chat.snapshot().timers[0];
  chat.saveTimer({ ...timer, enabled: false });
  time += 120000;
  await chat.tick();
  assert.equal(sent.length, 2);
  chat.removeTimer(timer.id);
  assert.equal(chat.snapshot().timers.length, 0);
});

test('controles exigem permissão local, isolam plataformas, ignoram histórico e duplicatas', async () => {
  let time = 100000;
  const store = { state: {}, save(value) { this.state = value; } };
  const actions = [];
  const chat = new ChatAutomation({ store, now: () => time, send: async () => {},
    control: async action => actions.push(action), isOwner: message => message.login === 'owner', report: () => {} });
  chat.saveMember({ platform: 'kick', login: '@Pessoa', role: 'DJ', permissions: ['skip', 'pause'] });
  const msg = { platform: 'kick', login: 'pessoa', text: '!skip', id: 'one' };
  await chat.receive({ ...msg, platform: 'twitch' });
  await chat.receive({ ...msg, historical: true });
  await chat.receive({ ...msg, text: '!stop' });
  assert.deepEqual(actions, []);
  await chat.receive(msg);
  time += 4000;
  await chat.receive(msg);
  await chat.receive({ ...msg, id: 'two', text: '!pausa' });
  assert.deepEqual(actions, ['skip', 'pause']);
  chat.saveMember({ platform: 'kick', login: 'pessoa', permissions: [] });
  time += 4000;
  await chat.receive({ ...msg, id: 'three' });
  await chat.receive({ ...msg, login: 'owner', id: 'four', text: '!stop' });
  assert.deepEqual(actions, ['skip', 'pause', 'stop']);
});

test('skip por votos conta uma vez por pessoa, expira e permite salto direto autorizado', async () => {
 let time=100000;
 const store={state:{},save(value){this.state=value}};
 const actions=[];
 const chat=new ChatAutomation({store,now:()=>time,send:async()=>{},control:async action=>actions.push(action),isOwner:()=>false,report:()=>{}});
 chat.saveVoting({required:2,seconds:10});
 const message=(login,id)=>({platform:'kick',login,id,text:'!skip'});
 await chat.receive(message('a','1'));
 time+=4000;
 await chat.receive(message('a','2'));
 assert.equal(actions.length,0);
 await chat.receive(message('b','3'));
 assert.deepEqual(actions,['skip']);
 time+=11000;
 await chat.receive(message('a','4'));
 time+=11000;
 await chat.receive(message('b','5'));
 assert.equal(actions.length,1);
 chat.saveMember({platform:'kick',login:'dj',permissions:['skip']});
 await chat.receive(message('dj','6'));
 assert.deepEqual(actions,['skip','skip']);
 assert.equal(chat.votes.size,0);
});

test('promoção usa nome configurável e só a pessoa autorizada pode executá-la', async () => {
 const store={state:{},save(value){this.state=value}};
 const calls=[];
 const chat=new ChatAutomation({store,now:()=>100000,send:async()=>{},control:async(...args)=>calls.push(args),isOwner:()=>false,report:()=>{}});
 chat.savePromoteCommand({command:'!prioridade'});
 chat.saveMember({platform:'twitch',login:'dj',permissions:['promote']});
 await chat.receive({platform:'twitch',login:'pessoa',text:'!prioridade 3',id:'1'});
 await chat.receive({platform:'twitch',login:'dj',text:'!promote 3',id:'2'});
 assert.equal(calls.length,0);
 await chat.receive({platform:'twitch',login:'dj',text:'!prioridade Nome da música',id:'3'});
 assert.deepEqual(calls,[['promote',['Nome da música']]]);
 assert.throws(()=>chat.savePromoteCommand({command:'!skip'}));
});

test('respostas personalizadas usam o canal de origem, variáveis, cooldown e exclusão', async () => {
 let time=100000;
 const store={state:{},save(value){this.state=value}};
 const sent=[];
 const chat=new ChatAutomation({store,now:()=>time,send:async(...args)=>sent.push(args),control:async()=>{},isOwner:()=>false,report:()=>{}});
 chat.saveResponse({trigger:'!Discord',text:'Olá $username, link: $args'});
 const a={platform:'kick',login:'pessoa',user:'Pessoa',id:'1',text:'!DISCORD exemplo'};
 await chat.receive({...a,historical:true});
 await chat.receive(a);await chat.receive(a);
 await chat.receive({...a,id:'2'});
 await chat.receive({...a,platform:'twitch',id:'3'});
 assert.deepEqual(sent,[['kick','Olá Pessoa, link: exemplo'],['twitch','Olá Pessoa, link: exemplo']]);
 const command=chat.snapshot().responses[0];
 chat.saveResponse({id:command.id,trigger:'!discord',text:'Pausado',enabled:false});
 time+=6000;await chat.receive({...a,id:'4'});
 assert.equal(sent.length,2);
 chat.removeResponse(command.id);
 assert.equal(chat.snapshot().responses.length,0);
 assert.throws(()=>chat.saveResponse({trigger:'!skip',text:'Conflito'}));
});
