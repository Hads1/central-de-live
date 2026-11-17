# Kaia Chat 0.11.10 — conexão e widgets

Inclui os novos layouts e editores HTML/CSS descritos em [Widgets](WIDGETS-0.11.9.md).

- Verificação WebSocket a cada 30 segundos; conexão sem resposta é encerrada e reconectada automaticamente. Chat silencioso não é confundido com queda.
- Kick/Centrifugo: renova o token temporário dentro da conexão existente, antes da expiração, sem fechar a sala a cada renovação. Recupera assinatura removida pelo servidor. Falha ou ausência de confirmação da renovação aciona reconexão.
- Twitch/Kick: prazo para abertura e confirmação da sala. Reconexões usam espera crescente até 30 segundos para evitar excesso de tentativas.
- Starvios: verifica resposta ao heartbeat da aplicação e confirmação da sala, além do ping de transporte. Mantém a consulta periódica alternativa.
- Widget: verifica sinal de vida local e restabelece a conexão/histórico visível automaticamente.

Validação: 34 testes JavaScript; 45 testes Python; testes DOM do aplicativo. Teste real de 60 segundos com Twitch, Kick e Starvios conectados (nenhuma nova mensagem chegou nesse intervalo). A Kick confirmou uma renovação real do token na mesma conexão já inscrita na sala. Isso não equivale a um teste de live de várias horas nem garante ausência de quedas externas.

O log local `connections.log`, na pasta de dados do aplicativo, registra estados e falhas. Nunca inclua dados pessoais, configurações ou URLs privadas ao compartilhar uma distribuição.

Referência do mecanismo de renovação: https://centrifugal.dev/docs/server/authentication
