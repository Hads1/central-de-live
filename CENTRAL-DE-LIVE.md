# Central de Live

Aplicativo local para Windows. Extraia a distribuição e abra **Central de Live.exe**. Os dados de uso ficam em `%APPDATA%\Central de Live`.

## Conectar as contas

Abra **Conexões e resgates**. Configure cada aplicativo uma vez. Nos acessos seguintes, use o botão **Conectar** da plataforma e autorize no navegador oficial. A Central conserva a configuração do aplicativo quando você desconecta a conta e protege os tokens e segredos com o armazenamento criptografado do Windows.

| Plataforma | Configuração inicial | O que a Central usa |
| --- | --- | --- |
| Twitch | Registre a Central como **Público** no [console da Twitch](https://dev.twitch.tv/console/apps). Copie o **Client ID** e clique em **Salvar Client ID**. A Central também aceita um ID já fornecido via `CENTRAL_TWITCH_CLIENT_ID`. | Autorize com a conta dona do canal para acessar o chat e os resgates de pontos. O Client ID identifica o aplicativo, enquanto sua autorização define o canal. |
| Kick | No [painel de desenvolvedor da Kick](https://kick.com/settings/developer), registre o aplicativo com a URL de retorno `http://localhost:19350/central/kick`. Salve ID e segredo na Central. | Autorize a conta para a Central identificar seu canal e enviar mensagens. O chat usa a leitura pública já disponível. |
| YouTube | No [Google Cloud](https://console.cloud.google.com/apis/credentials), habilite a **YouTube Data API v3** e crie um cliente OAuth do tipo **Aplicativo para computador**. Importe seu JSON em **Importar JSON do Google**. Se a tela de consentimento estiver em teste, inclua a conta como usuária de teste. | Selecione a conta e o canal corretos na autorização. A Central lê e envia mensagens quando encontra uma live ativa do canal com chat. |
| Starvios | Informe o canal ou a URL em **Adicionar canal público**. **Abrir Starvios** leva ao site oficial. | Leitura pública na Central. O login e o envio ficam no navegador. |

Use **Destinos**, ao lado da caixa de mensagem, para marcar uma ou várias plataformas. O resultado de envio aparece por destino. As conexões do Spotify e do YouTube para reprodução de músicas continuam na aba **SR / Spotify**.

Em **Widget → Contadores de espectadores**, ative e inclua as plataformas desejadas. Twitch, Kick e YouTube usam a sessão de **Conexões e resgates**. No chat, o contador ocupa uma linha própria acima ou abaixo do feed. No OBS, a URL do contador é uma fonte Navegador independente, que pode ser posicionada separadamente.

## Transcrição e OBS

As mensagens recebidas e os resgates da Twitch usam o mesmo TXT. Para um perfil novo, ele fica em `%APPDATA%\Central de Live\chat.txt`. Um caminho de transcrição que você já tenha escolhido continua em uso.

Em **Conexões e resgates → Mini alertas de pontos do canal**, clique em **Buscar dispositivos**, escolha a **Saída de áudio das automações** e salve. Áudios de alerta e faixas sonoras de vídeo usam o processo `central_automacoes.exe`, separado do SR, do leitor e do som de mensagens. O vídeo continua visível na Central.

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
