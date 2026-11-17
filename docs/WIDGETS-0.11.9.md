# Widgets e conexão — 0.11.9

## Chat

Na aba Widget, escolha Clássico, Cartões, Compacto, Balões, Neon, Terminal ou Transmissão. Ajuste fonte, espaçamento, cantos e cor; a prévia muda enquanto você edita. Salvar aplica à fonte de navegador do OBS.

O campo HTML define a estrutura de cada mensagem. Use classes para seu CSS e os pontos de inserção:

```html
<header>
  <span data-slot="platform"></span><strong data-slot="user"></strong>
</header>
<section data-slot="message"></section>
```

HTML vazio usa o modelo padrão. Os campos não incluídos são acrescentados no final para não perder mensagens. Os emotes continuam funcionando. Conteúdo das mensagens é tratado como texto, não como HTML.

## SR

Abra o editor do HUD personalizado na aba SR / Spotify. Além dos cinco modelos existentes há Cápsula, Pôster e Horizontal. Controles visuais ajustam tamanho, cores, fonte, fundo, cantos e elementos visíveis. HTML e CSS ficam em campos separados, com prévia antes de salvar. Exportar e Importar preservam o layout completo.

Blocos HTML: `label`, `title`, `who`, `progress`, `time`, sempre no atributo `data-slot`. O bloco indicado é substituído pelo elemento real; envolva-o em outro `div` ou `section` se quiser um contêiner próprio. O URL público continua sem mostrar nomes de solicitantes, conforme a configuração anterior. Áudio, filas e reprodução não são alterados pelo layout.

HTML aceita elementos estruturais, texto e classes. Scripts, iframes, atributos de eventos e navegação são removidos; esta área não é um editor JavaScript. CSS livre estiliza os elementos. Os seletores e IDs originais continuam disponíveis.

## Recuperação do chat

Twitch, Kick e Starvios verificam a resposta do WebSocket a cada 30 segundos. Duas verificações sem resposta encerram o transporte preso e acionam a reconexão existente. Na Twitch e Kick, confirmação da sala tem prazo de 25 segundos e abertura de conexão tem prazo de 15 segundos. Chat sem mensagens não é considerado travado.

O widget recebe sinal de vida do servidor local a cada 20 segundos. Se ficar mais de 65 segundos sem eventos, reabre sua conexão e recupera o histórico ainda visível. Isso não recupera mensagens que a plataforma não disponibilizou durante a queda.

## Validação

Testes automatizados verificam ping/pong, timeout, limpeza dos temporizadores, normalização e segurança dos templates, emotes e manutenção de elementos do SR. A validação em uma live prolongada continua necessária; não foi reproduzida a causa exata da interrupção relatada.
