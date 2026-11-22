# Central de Live

Aplicativo local para Windows. Extraia a distribuição e abra **Central de Live.exe**. Os dados de uso ficam em `%APPDATA%\Central de Live`.

## Conectar as contas

Abra **Contas e conexões**. Configure cada aplicativo uma vez. Nos acessos seguintes, use o botão **Conectar** da plataforma e autorize no navegador oficial. A Central conserva a configuração do aplicativo quando você desconecta a conta e protege os tokens e segredos com o armazenamento criptografado do Windows.

| Plataforma | Configuração inicial | O que a Central usa |
| --- | --- | --- |
| Twitch | Registre a Central como **Público** no [console da Twitch](https://dev.twitch.tv/console/apps). Copie o **Client ID** e clique em **Salvar Client ID**. A Central também aceita um ID já fornecido via `CENTRAL_TWITCH_CLIENT_ID`. | Autorize com a conta dona do canal para acessar o chat e os resgates de pontos. O Client ID identifica o aplicativo, enquanto sua autorização define o canal. |
| Kick | No [painel de desenvolvedor da Kick](https://kick.com/settings/developer), registre o aplicativo com a URL de retorno `http://localhost:19350/central/kick`. Salve ID e segredo na Central. | Autorize a conta para a Central identificar seu canal e enviar mensagens. O chat usa a leitura pública já disponível. |
| YouTube | No [Google Cloud](https://console.cloud.google.com/apis/credentials), habilite a **YouTube Data API v3** e crie um cliente OAuth do tipo **Aplicativo para computador**. Importe seu JSON em **Importar JSON do Google**. Se a tela de consentimento estiver em teste, inclua a conta como usuária de teste. | Selecione a conta e o canal corretos na autorização. A Central lê e envia mensagens quando encontra uma live ativa do canal com chat. |
| Starvios | Informe o canal ou a URL em **Adicionar canal público**. **Abrir Starvios** leva ao site oficial. | Leitura pública na Central. Use Conectar conta Starvios para login, eventos e envio pela Central. |

Use **Destinos**, ao lado da caixa de mensagem, para marcar uma ou várias plataformas. O resultado de envio aparece por destino. As conexões do Spotify e do YouTube para reprodução de músicas ficam em **Contas e conexões → Contas de música**.

Em **Contadores**, ative e inclua as plataformas desejadas. Twitch, Kick e YouTube usam a sessão de **Contas e conexões**. No chat, o contador ocupa uma linha própria acima ou abaixo do feed. No OBS, a URL do contador é uma fonte Navegador independente, que pode ser posicionada separadamente.

## Transcrição e OBS

Na aba **Mensagens**, crie mensagens recorrentes com intervalo e destinos selecionados. A primeira execução ocorre depois do intervalo, com a Central aberta. É possível editar, pausar, excluir e enviar imediatamente. Ao reabrir, o tempo começa novamente.

Em **Comandos de resposta**, preencha um gatilho, como **!discord**, e a mensagem que será enviada. Você pode ativar, editar e excluir cada resposta. Ao usar o comando no chat, a Central responde no mesmo canal Twitch, Kick ou YouTube conectado. **$username** insere o nome da pessoa e **$args** insere o texto após o comando.

Em **Permissões**, atribua cargos locais por plataforma e usuário e marque os controles de SR permitidos. **!skip / !pular**, **!pausa / !pause**, **!play / !continuar**, **!stop / !parar** e **!anterior** executam as operações autorizadas. Espectadores sem permissão para pular votam com **!skip**. O padrão inicial é 3 votos em 120 segundos e pode ser alterado em **SR / Spotify → Comandos e votação**. Uma conta conta uma vez por rodada em cada plataforma. A mudança de música e o fim do prazo reiniciam os votos. Para conceder acesso no YouTube, use o ID do canal da pessoa.

O comando **!promote 3** coloca a terceira música aguardando como próxima a tocar. Também é possível usar **!promote Nome da música**. Em **Comando para promover música**, escolha outro gatilho, por exemplo **!prioridade**, e salve. Conceda a permissão **Promover música** às pessoas autorizadas. Um nome ambíguo pede uma seleção mais específica.

Na aba **SR / Spotify**, adicione o link de uma playlist do YouTube e aguarde a importação terminar. **Salvar playlist** guarda os títulos e links da playlist de fundo em um JSON local. **Recuperar última playlist** abre o último salvamento, e **Selecionar playlist salva…** permite escolher um JSON da Central. O resultado aparece junto aos botões. Pedidos avulsos do chat ficam na fila de pedidos.

Ative **Anunciar no chat a música adicionada**, marque os destinos e clique em **Salvar SR**. Cada pedido aceito é anunciado com o título e o solicitante nos canais conectados selecionados. O anúncio usa a conta vinculada à Central.

As mensagens recebidas e os resgates da Twitch usam o mesmo TXT. Para um perfil novo, ele fica em `%APPDATA%\Central de Live\chat.txt`. Um caminho de transcrição que você já tenha escolhido continua em uso.

Em **Widgets / OBS → Widgets de alertas e áudio OBS**, clique em **Buscar dispositivos**, escolha a **Saída de áudio das automações** e salve. Áudios de alerta e faixas sonoras de vídeo usam o processo `central_automacoes.exe`, separado do SR, do leitor e do som de mensagens. O vídeo continua visível na Central.

Para enviar o áudio direto ao OBS, selecione **OBS · Fonte Navegador de áudio**, salve e clique em **Copiar URL de áudio**. Crie uma fonte **Navegador** chamada **Central de Live · Alertas**, cole essa URL e marque **Controlar áudio via OBS**. Nas **Propriedades avançadas de áudio**, atribua à fonte uma faixa exclusiva. Em **Configurações → Saída → Gravação**, habilite essa faixa junto com as faixas que já usa. [Gravação com várias faixas](https://obsproject.com/kb/multiple-audio-track-recording-guide)

No OBS, capture o processo de automações individualmente onde houver suporte. Se o processo auxiliar não aparecer na lista, selecione um dispositivo de áudio virtual exclusivo na Central, por exemplo **CABLE Input**, e capture a saída correspondente, **CABLE Output**, como **Captura de entrada de áudio** no OBS. Use as propriedades avançadas de áudio para colocar as fontes nas faixas desejadas dentro da mesma gravação. [Guia de captura de áudio do OBS](https://obsproject.com/kb/application-audio-capture-guide)

## Resgates e automações

- Escolha Twitch ou Kick em **Plataforma da recompensa** e clique em **Carregar recompensas**. Preencha **Vídeo, GIF ou imagem**, **Áudio separado**, ou os dois. Se quiser compartilhar a regra, selecione uma recompensa da outra plataforma antes de salvar. O resgate aparece no chat da Central e dispara a mídia. Se houver áudio separado, ele substitui a faixa sonora do vídeo.
- Em **Criar recompensa nos canais**, preencha nome, custo e descrição, escolha a mídia nos campos acima e marque as plataformas. O cadastro fica nos canais e a mídia fica vinculada na Central. A Kick é consultada a cada 8 segundos. Reconecte a Kick e, para criar recompensas, reconecte também a Twitch para conceder as permissões novas.
- Para o Stream Deck, salve um **Atalho global** na regra e crie uma ação **Tecla de atalho** com a mesma combinação. A Central deve estar aberta para disparar o alerta.
- Em **Widget de alertas para o OBS**, clique em **Copiar URL** e cole o endereço em uma fonte **Navegador** do OBS, com **Arquivo local** desmarcado. Posicione a fonte na cena e clique em **Testar combinação** ou **Testar regra salva** na Central. O widget fica transparente enquanto aguarda um alerta. Para vídeo, use MP4 ou WebM com um codec compatível com o navegador do OBS. [Fonte Navegador do OBS](https://obsproject.com/kb/browser-source)
- Capture o áudio pela saída das automações configurada na Central. A fonte Navegador exibe o vídeo sem duplicar sua faixa de áudio. Um alerta de áudio exibe o nome da recompensa no widget durante a reprodução.
- A seção **Criar comando de chat** aceita respostas Twitch com `$username` e `$args`.

O motor atual cobre mídia por recompensa personalizada da Twitch e da Kick e comandos locais de resposta. Moderação, sorteios, loja, jogos e os demais tipos de ação ainda precisam ser implementados.


### Mensagens de alertas compartilhadas (teste 13)

Em **Alertas → Mensagens automáticas**, seguidor e inscrição usam um único modelo por evento. Use `{usuario}`, `{canal}` e `{plataforma}`. O envio acontece somente no canal de origem. Ative o modelo e salve. O status das conexões fica em Contas e conexões.

- **Twitch:** desconecte e conecte novamente, autorizando leitura de seguidores e inscrições. Os eventos chegam por EventSub.
- **Kick:** em Contas e conexões, reconecte para conceder `events:subscribe`. No portal de desenvolvedores Kick, habilite Webhooks. Cadastre uma URL HTTPS pública estável de um proxy/túnel que encaminhe **apenas** `/integrations/kick/events` para o receptor local exibido em Contas e conexões. Não exponha os demais caminhos do servidor de widgets. A porta padrão local é 19349, mas use a URL efetivamente exibida. Depois clique **Ativar eventos Kick**. A Central verifica a assinatura da Kick e o canal da conta vinculada. Sem esse encaminhamento, follows e inscrições não chegam ao aplicativo. Clique novamente para restaurar assinaturas removidas pela Kick. Resgates de pontos continuam com sua integração já existente, sem precisar desse webhook.
- **Starvios:** configure seu canal no Chat e clique **Conectar conta Starvios** em **Contas e conexões**. Entre no site com a conta dona desse canal. A janela é ocultada quando a sessão está pronta. A Central consulta o mesmo feed de atividades do site a cada 15 segundos e ignora as atividades anteriores à conexão. A sessão é privada deste computador. **Desconectar conta Starvios** apaga essa sessão. O cliente do site pode mudar, pois a integração depende dele. Essa conexão também habilita Starvios como destino de mensagens, timers, respostas personalizadas e anúncios do SR.
- **YouTube:** use a conta vinculada e mantenha a live com chat ativo. A Central recebe novos membros, mensagens de marco de membros e recebimento de membros presenteados pelo chat. A API não entrega um evento individual de novo inscrito gratuito equivalente ao follow.

Para conferir o funcionamento real, habilite o modelo, salve e acompanhe um evento novo na plataforma com a conexão pronta. A prévia apenas mostra o texto, sem publicar mensagens. Falhas de envio aparecem no estado das automações. Os testes automatizados usam eventos de teste e não publicam agradecimentos reais.

Referências: [eventos Kick](https://github.com/KickEngineering/KickDevDocs/blob/main/events/event-types.md), [assinaturas de webhook Kick](https://github.com/KickEngineering/KickDevDocs/blob/main/events/webhook-security.md), [eventos do chat YouTube](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages), [feed de atividades Starvios](https://starvios.com/popout/activity).


### Organização das telas (teste 14)

- **Contas e conexões:** Twitch, Kick, YouTube, Starvios, sessões de música, Spotify e autorizações de eventos.
- **Resgates:** recompensas, mídia vinculada, pontos e atalhos para Stream Deck.
- **Alertas:** textos e variáveis das mensagens de eventos.
- **Mensagens:** respostas !comando, temporizadores e biblioteca de automações.
- **Permissões:** cargos locais e controles permitidos por usuário.
- **SR / Spotify:** player, filas, playlist, comandos, votação e saída das músicas.
- **Leitor:** voz, saída de leitura e monitoramento de alertas externos para leitura.
- **Widgets / OBS:** widget do chat, URLs de alertas, áudio separado, HUD e soundbar.
- **Contadores:** seleção de plataformas, apresentação e fontes de espectadores.
- **Tutorial:** instruções e caminhos atualizados.

A reorganização preserva configurações e conexões já salvas. A aba Chat conserva seus campos e controles.
