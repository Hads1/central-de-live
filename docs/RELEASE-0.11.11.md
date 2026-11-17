# Kaia Chat 0.11.11 — contadores de espectadores

- Contadores separados por plataforma no chat normal e no overlay transparente.
- Total agregado com identificação de soma parcial quando uma plataforma está sem dados.
- Posição superior/inferior, tamanho, cor e logos de canal configuráveis.
- Widgets para OBS: cada plataforma, somente total e conjunto completo.
- Twitch e Kick usam credenciais de aplicação fornecidas pelo usuário, cifradas pelo Windows. Tokens são renovados automaticamente. Não há chaves compartilhadas na distribuição.
- Starvios consulta contagem pública sem abrir o vídeo. Conector personalizado aceita API JSON autorizada.
- Falhas, autenticação ausente e dados antigos mostram indisponibilidade em vez de zero.

Veja [configuração e limites](CONTADORES.md). Testes de contadores e integração de interface passaram; Twitch/Kick ainda exigem validação real com credenciais do usuário.

**Esta versão não resolve o bloqueio HTTP 403 do SR registrado no [check-up anterior](CHECKUP-0.11.10-2026-10-25.md). Não foi publicada no GitHub.**
