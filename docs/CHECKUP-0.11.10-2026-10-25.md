# Check-up Kaia Chat 0.11.10 — 25/10/2026

**Resultado: publicação não aprovada.** Foi reproduzida uma falha real de acesso ao áudio do YouTube no SR. O código e o ZIP 0.11.10 foram preservados; nenhuma nova versão foi enviada ao GitHub nesta verificação.

## Resultados confirmados

| Área | Verificação | Resultado |
|---|---|---|
| Lógica JavaScript | 34 testes: mensagens, duplicatas, bloqueios, prioridades, alertas, atalhos, idiomas, Spotify simulado, reconexão e renovação | Passou |
| Motor Python/SR | 45 testes: playlists, persistência, diagnósticos, decoder real, volume e recuperação de conexão HTTP simulada | Passou |
| Aplicativo fonte | Smoke DOM: configurações, restauração, overlay, janelas, widgets, HTML, CSS, emotes, paginação, controles e idiomas | Passou |
| Executável distribuído | Smoke DOM no KaiaChat.exe do pacote; término com código 0 | Passou |
| TTS real | Frase de teste com nome, pedido musical e alerta; saída configurada do leitor | Motor informou leitura concluída; nenhum MP3/WAV temporário permaneceu |
| Áudio separado | Abertura simultânea de kaia_musica.exe, kaia_leitura.exe e kaia_tts.exe | Três processos ativos; progresso do SR avançou; mudar volume não reiniciou o processo |
| Conexão real | Twitch, Kick e Starvios: verificação inicial de 60 segundos | Conectados; nenhuma mensagem nova chegou no intervalo |
| Conexão real com interrupção | 180 segundos; queda forçada da Twitch aos 45 segundos | Twitch reconectou automaticamente; Twitch, Kick e Starvios terminaram conectados; nenhuma queda espontânea observada nesse período |
| Renovação Kick | Token real renovado dentro da conexão inscrita na sala | Servidor confirmou; socket permaneceu aberto |
| Recuperação Twitch | Interrupção simulada do transporte em teste de integração | Nova conexão criada, sala reaberta e encerramento sem tentativas pendentes |
| Carga de mensagens | 20.000 mensagens sintéticas no servidor de widgets e fila do leitor | Histórico limitado a 300; fila de voz limitada a 10; sem crescimento ilimitado |
| Pacote | CRC do ZIP e igualdade dos principais arquivos testados com os distribuídos | Passou |
| Privacidade | 2.039 arquivos de texto do ZIP comparados aos valores privados configurados | Nenhuma correspondência encontrada |

## Falha que impede a aprovação

A música **Y2K, bbno$ — Lalala (Official Video)** foi localizada, mas a leitura do fluxo de áudio retornou **HTTP 403 Forbidden** antes da reprodução. O decoder não recebeu áudio: **0 segundos** de aproximadamente 178 esperados.

O teste foi repetido com **yt-dlp 2026.10.21** e **yt-dlp-ejs 0.8.0**, instalados somente numa pasta isolada de pesquisa, incluindo os cabeçalhos retornados pelo extrator. O servidor continuou retornando 403. A atualização isolada não foi incorporada ao aplicativo, pois não corrigiu o problema.

Em contraste, a faixa **JUJUTSU KAISEN Opening | Kaikai Kitan by Eve**, ID `GwaRztMaoY0`, da playlist enviada pelo usuário, teve **100,171 segundos de áudio decodificados**, término normal e reprodução integral validada no pipeline de áudio com saída de teste silenciosa. Isso confirma que o motor funciona com um fluxo acessível, mas não que todas as músicas funcionem.

O acesso foi negado pelo servidor de mídia. Ainda não foi determinada a causa exata para essa faixa; não é correto afirmar que fazer login ou atualizar o extrator resolverá. A documentação do extrator registra que algumas exigências de token do YouTube podem produzir 403, mas esse mecanismo específico não foi comprovado como causa deste caso: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide

## Limites desta validação

- Os testes de interface inspecionam o DOM e estados da janela; não equivalem a revisão visual de cada tela em todos os monitores.
- Não houve transmissão completa de várias horas nem reprodução integral de todas as 558 músicas.
- A separação dos processos de áudio foi validada; os medidores/fontes configurados no OBS não foram verificados nesta rodada.
- Os alertas foram testados por simulação automatizada; não foi disparado um novo alerta público do Streamlabs/StreamElements.
- Spotify foi validado por testes simulados de conexão e estado, sem uma sessão real de reprodução autenticada nesta rodada.
- O limite da fila do leitor descarta mensagens antigas/excedentes por configuração. No teste de carga, 19.989 mensagens foram descartadas dessa forma, com uma leitura ativa e dez aguardando. Isso evita atraso crescente, mas não garante leitura de todas as mensagens numa rajada.
- Falhas de internet, restrições das plataformas, suspensão do Windows e dispositivos de áudio removidos impedem qualquer garantia de funcionamento 100% em todos os ambientes.

## Decisão

**Não publicar como versão integralmente aprovada.** O SR tem uma falha real reproduzível para uma das músicas verificadas. É necessário resolver ou aceitar explicitamente essa limitação antes de uma publicação que pretenda cumprir a condição solicitada. Os testes que passaram não anulam esse bloqueio.
