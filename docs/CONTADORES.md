# Contadores de espectadores — Kaia Chat 0.11.12

## Onde aparecem

Abra **Widget → Contadores de espectadores — chat e OBS**. Os contadores seguem os canais ativados nas configurações gerais: Twitch, Kick, Starvios e plataforma personalizada.

- Chat normal: contadores por plataforma e total, junto ao chat.
- Modo transparente: somente logos, nomes e números; não interceptam os cliques do jogo. Escolha posição superior ou inferior.
- OBS: há URLs separadas para Twitch, Kick, Starvios e plataforma personalizada, uma URL somente para o total e outra para todos os contadores com o total. Copie a URL desejada para uma **Fonte de navegador**. Sugestão inicial: 600 × 160 para o conjunto e 280 × 80 para um contador, ajustando à fonte escolhida.

Mantenha o Kaia aberto. O fundo dos widgets é transparente. As URLs funcionam neste computador. O campo de logo aceita URL HTTPS de imagem do seu canal; vazio usa a identidade da plataforma (ou a inicial no conector personalizado).

Você pode ativar/desativar a exibição no chat e no overlay separadamente, escolher cor, tamanho da fonte e atualizar a cada 30 a 300 segundos. O padrão para novas configurações é 30 segundos; configurações existentes preservam o intervalo salvo. Widgets consultam o estado local a cada cinco segundos, sem multiplicar consultas às plataformas.

## O que os números significam

São contagens fornecidas pelas plataformas, não uma estimativa baseada em mensagens ou participantes do chat. O total é a soma das plataformas disponíveis; uma pessoa assistindo em duas plataformas pode ser contada duas vezes.

`—` significa sem informação confiável. Quando uma plataforma falha ou não tem credenciais, ela não entra na soma, que passa a se chamar **Total parcial**. Um canal confirmado offline tem contagem zero. Respostas inválidas, antigas ou negadas não são convertidas em zero. Cada serviço pode atrasar ou calcular a audiência de forma diferente.

## Twitch e Kick: configuração necessária

A leitura do chat continua independente. Para consultar audiência pelas APIs oficiais, cada usuário precisa cadastrar sua própria aplicação e informar **Client ID** e **Client Secret**. Esses campos não são o login nem a senha da sua conta.

### Twitch

1. Entre no [Console de desenvolvedores da Twitch](https://dev.twitch.tv/console/apps) com sua conta e habilite a autenticação de dois fatores se solicitada.
2. Registre uma aplicação conforme o [guia oficial](https://dev.twitch.tv/docs/authentication/register-app/). Para este fluxo de credenciais da aplicação, é necessário gerar um Client Secret. Se o formulário exigir uma URL de redirecionamento, cadastre uma URL local permitida pelo portal; o contador usa client credentials e não faz redirecionamento de login.
3. Copie o Client ID e gere/copie o Client Secret. Insira ambos na seção Twitch dos contadores e clique **Salvar e atualizar contadores**.
4. Confira o canal nas configurações gerais do chat. Se não estiver transmitindo, o contador deverá indicar zero; erro de autenticação aparece no estado do contador.

Documentação da contagem: [Get Streams](https://dev.twitch.tv/docs/api/reference/#get-streams). Autenticação: [Client credentials](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#client-credentials-grant-flow).

### Kick

1. Entre na sua conta Kick, habilite 2FA e abra a área **Developer** nas configurações.
2. Crie sua aplicação seguindo o [guia oficial da Kick](https://github.com/KickEngineering/KickDevDocs/blob/main/getting-started/kick-apps-setup.md).
3. Copie Client ID e Client Secret para a seção Kick e salve. O aplicativo obtém e renova o token de aplicação automaticamente.

Consulta usada: [Get Channels, API oficial](https://api.kick.com/swagger/doc.yaml), campo `stream.viewer_count`. Só são realizadas consultas de leitura dos canais.

### Proteção das credenciais

Os segredos ficam cifrados pelo Windows num arquivo separado da pasta de dados do usuário. Não são enviados às URLs dos widgets nem incluídos no pacote público. Deixar o campo Secret vazio mantém o valor salvo; marque **Excluir credencial salva** para removê-lo. Cada pessoa configura suas próprias credenciais. Não distribua uma aplicação com as suas chaves embutidas.

## Starvios

Usa a contagem pública `live_viewer_counts` que o próprio site consulta. Não abre vídeo nem registra uma nova presença para obter o número. Não exige Client ID ou Secret neste conector. Mudanças no serviço podem tornar o contador indisponível; isso será mostrado como falta de dados, sem inventar audiência.

## Plataforma personalizada

Informe uma API JSON autorizada que forneça a contagem de espectadores da plataforma. Não basta inserir o endereço HTML do canal. Aceita HTTPS e HTTP local, para um adaptador no próprio computador.

Exemplo de formato (dados ilustrativos):

```json
{ "live": true, "viewers": 42 }
```

Configure `viewers` como campo da contagem e `live` como campo ao vivo. Campos aninhados usam ponto, como `metrics.audience`. O estado deve ser booleano e a contagem deve ser um inteiro não negativo. Sem uma API que forneça essa informação, o contador não pode obter um número real.

## Validação e limites desta versão

Testes verificam total parcial, zero/offline, respostas inválidas, expiração e renovação de token, requisições antigas após troca de canal, proteção de segredos, widgets individuais e unificado, e presença no overlay com passagem de cliques. A consulta real à Starvios retornou offline no teste do canal configurado. Twitch/Kick foram testadas com respostas simuladas das APIs; a validação real depende das credenciais do usuário.

Os contadores não corrigem nem alteram o motor do SR. A falha HTTP 403 de reprodução de uma música, identificada no check-up da 0.11.10, continua uma pendência separada. Este pacote é para validação local e não está aprovado para publicação como um sistema sem falhas.

Logos: Twitch e Kick obtidos do [Simple Icons](https://github.com/simple-icons/simple-icons); Starvios usa o favicon público do site. Marcas identificam suas respectivas plataformas.


## Seleção opcional e diagnóstico (0.11.12)

Em instalações novas, os contadores começam desativados. Ative **Ativar contadores** e marque **Incluir esta plataforma nos contadores e no total** somente nas fontes desejadas. Salve. É possível mostrar somente Twitch, somente Kick ou qualquer combinação dos canais configurados. Desmarcar uma fonte interrompe apenas a consulta de audiência; a leitura do chat continua. A seleção também se aplica aos widgets. O total soma somente as fontes selecionadas.

**Mostrar no chat**, **Mostrar no modo transparente** e **Mostrar o total** são controles independentes. A URL do widget somente-total continua disponível quando o total é ocultado do conjunto. Sem fontes selecionadas, os contadores ficam vazios.

Cada fonte mostra o motivo de indisponibilidade, o estado offline ou a última consulta bem-sucedida. Client ID/Secret ausentes não significam canal offline: é necessário configurá-los para acessar as APIs oficiais. Ao abrir a live, aguarde o intervalo configurado e a atualização da plataforma. Não há garantia de igualdade instantânea com o painel do serviço.

Uma resposta HTTP 401 durante a consulta provoca renovação do token e uma nova tentativa imediata, limitada a uma para evitar loops. Falhas persistentes ficam visíveis; HTTP 429 respeita a espera solicitada.
