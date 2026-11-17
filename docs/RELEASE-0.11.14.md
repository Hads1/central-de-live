# Kaia Chat 0.11.14 — atalhos globais de volume

O volume das músicas agora pode ser aumentado e reduzido por atalhos editáveis na aba SR / Spotify. Cada acionamento altera 5 pontos percentuais, limitado a 0–100. As barras da aba SR e da página Chat recebem o mesmo estado e a preferência é salva. Voz e alertas mantêm seus volumes próprios.

## Ativar
Abra SR / Spotify → Atalhos globais. Os novos campos sugerem Ctrl+Alt+Up e Ctrl+Alt+Down. Clique Salvar atalhos globais para registrar; também podem ser substituídos por outras combinações. Campos vazios desativam a ação. Conflitos são informados e preservam os atalhos anteriores. O registro é global no Windows, permitindo uso com outra janela em primeiro plano.

## Validação
49 testes JavaScript e 45 testes Python passaram. Testes de interface verificam o registro global, persistência, sincronização de ambas as barras, sequência de três comandos concorrentes e limites zero/cem. A simulação de comandos não substitui um teste manual com o jogo do usuário em primeiro plano. Nenhum segredo deve ser distribuído.

## Pendências anteriores
Twitch/Kick ainda dependem das credenciais de contagem não configuradas no perfil verificado. A falha HTTP 403 de determinadas músicas do SR não foi reparada nesta versão. Não declarar o sistema inteiro livre de falhas. Pacote preparado localmente; não publicado no GitHub.
