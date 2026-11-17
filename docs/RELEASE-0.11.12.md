# Kaia Chat 0.11.12 — seleção e diagnóstico de audiência

- Contadores opcionais; instalações novas começam com o recurso desligado.
- Escolha independente das plataformas incluídas; ocultar contadores não desconecta chats.
- Controles para exibição no chat, overlay e total.
- Diagnóstico visível de credenciais ausentes, falhas e última consulta por plataforma.
- Renovação imediata e limitada de tokens recusados com HTTP 401.
- Correção do ícone do total e de um argumento que era interpretado como URL de imagem.

Validação: 49 testes JavaScript e 45 testes Python passaram. Consultas reais sem credenciais retornaram HTTP 401 nas duas plataformas. O perfil local inspecionado não tinha Client ID nem arquivo de credenciais dos contadores. Nenhum segredo foi coletado ou incluído no pacote.

**Validação de audiência real em Twitch/Kick pendente de credenciais inseridas pelo usuário e transmissão ativa. Não afirmar funcionamento autenticado com base nos testes simulados. A falha HTTP 403 de músicas do SR permanece fora desta correção. Não publicado no GitHub.**
