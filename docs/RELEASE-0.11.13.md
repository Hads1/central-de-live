# Kaia Chat 0.11.13

- Barra Volume das músicas no player da página Chat, sincronizada com a aba SR.
- Ajustes durante o arraste usam o comando set_volume do SR, com agrupamento de eventos de 40 ms e salvamento da preferência existente. Não alteram volumes de voz nem alertas.
- Falhas do comando de volume aparecem também na página Chat.

## Verificação dos contadores em 06/11/2026
Revisados normalização, leitura de APIs, tokens, polling, IPC, armazenamento protegido, interface e widgets. No perfil local consultado, Twitch e Kick estavam habilitadas sem Client ID e sem arquivo de credenciais. A execução do monitor com essa configuração retornou em ambas: Configure Client ID e Client Secret do contador. Não há evidência para atribuir esse caso a falha da soma ou do renderizador.

49 testes JavaScript e 45 testes Python passaram. A consulta autenticada durante uma live continua pendente de configuração pelo usuário. Consulte CONTADORES.md. Não são distribuídas credenciais.

A falha HTTP 403 anteriormente identificada no SR não é corrigida por este ajuste de volume. Versão local, não publicada no GitHub.
