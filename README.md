# Central de Live

Aplicativo para Windows x64 que reúne chat de transmissão, leitor de mensagens, pedidos de música e alertas por pontos da Twitch e da Kick. O chat tem modo transparente, e os mini alertas têm widget próprio para o OBS.

Criado por **Hads**.

## Download para Windows

[Baixar Central de Live 0.1.0-test.14 — Windows x64](https://github.com/Hads1/central-de-live/releases/download/v0.1.0-test.14/Central-de-Live-0.1.0-test.14-Windows-x64.zip)

[Notas da versão e SHA-256](https://github.com/Hads1/central-de-live/releases/tag/v0.1.0-test.14). Versão de testes com 59 testes automatizados aprovados e verificação de navegação, chat, áudio e widgets em perfil temporário.

## Abrir a versão portátil

Extraia o ZIP completo e dê dois cliques em **Central de Live.exe**. Os arquivos da distribuição devem permanecer na mesma pasta.

Abra a aba **Tutorial** para seguir os passos de conexão, configuração do chat e das recompensas e adição de fontes no OBS. O [guia de uso](CENTRAL-DE-LIVE.md) também está disponível no repositório. Os dados de uso ficam em `%APPDATA%\Central de Live`.

## Desenvolvimento no Windows

1. Instale o Node.js e execute `npm ci`.
2. Prepare o runtime de áudio com [scripts/prepare-media.ps1](scripts/prepare-media.ps1). O script usa Python 3.14 com pip e espera FFmpeg, FFplay e Node no PATH. Inclua as licenças da distribuição do runtime.
3. Use `npm start` para abrir, `npm test` para os testes e `npm run smoke` para testar o aplicativo com um perfil temporário.
4. Use `npm run package` para gerar a distribuição Windows x64 e o SHA-256 na pasta `dist`.

## Projeto de teste no GitHub

O repositório contém o código-fonte. Os ZIPs portáteis e seus SHA-256 ficam nas [Releases](https://github.com/Hads1/central-de-live/releases). Os dados locais de uso e as contas conectadas não acompanham a distribuição.

As configurações são divididas em Contas e conexões, Resgates, Alertas, Mensagens, Permissões, SR / Spotify, Leitor, Widgets / OBS, Contadores e Tutorial. O conteúdo e os controles da aba Chat foram preservados.

Follows e inscrições compartilham modelos de texto. A Twitch exige autorização dos eventos; a Kick exige webhook HTTPS público e a permissão events:subscribe; a Starvios exige login do dono do canal e usa o feed do próprio site. O YouTube entrega eventos de membros no chat ao vivo, mas não novos inscritos gratuitos individualmente. A recepção de eventos reais depende dessas conexões. Consulte o tutorial antes de ativar os agradecimentos.

A versão de teste usa a licença [GPLv3](LICENSE). Veja [créditos e licenças de terceiros](CREDITOS.md).
