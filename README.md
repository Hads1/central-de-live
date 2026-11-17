# Central de Live

Aplicativo para Windows x64 que reúne chat de transmissão, leitor de mensagens, pedidos de música e alertas por pontos da Twitch. O chat tem modo transparente, e os mini alertas têm widget próprio para o OBS.

Criado por **Hads**.

## Abrir a versão portátil

Extraia o ZIP completo e dê dois cliques em **Central de Live.exe**. Os arquivos da distribuição devem permanecer na mesma pasta.

Abra a aba **Tutorial** para seguir os passos de conexão, configuração do chat e das recompensas e adição de fontes no OBS. O [guia de uso](CENTRAL-DE-LIVE.md) também está disponível no repositório. Os dados de uso ficam em `%APPDATA%\Central de Live`.

## Desenvolvimento no Windows

1. Instale o Node.js e execute `npm ci`.
2. Prepare o runtime de áudio com [scripts/prepare-media.ps1](scripts/prepare-media.ps1). O script usa Python 3.14 com pip e espera FFmpeg, FFplay e Node no PATH. Inclua as licenças da distribuição do runtime.
3. Use `npm start` para abrir, `npm test` para os testes e `npm run smoke` para testar o aplicativo com um perfil temporário.
4. Use `npm run package` para gerar a distribuição Windows x64 e o SHA-256 na pasta `dist`.

## Projeto de teste no GitHub

O repositório contém o código-fonte. O ZIP portátil e seu SHA-256 são artefatos de distribuição em `dist`. Para disponibilizá-los no GitHub, crie uma Release marcada como pré-lançamento e anexe os dois arquivos.

A versão de teste usa a licença [GPLv3](LICENSE). Veja [créditos e licenças de terceiros](CREDITOS.md).
