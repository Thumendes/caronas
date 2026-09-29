# caronas-bot

Bot de Telegram para controlar caronas. Roda em Cloudflare Workers + D1; a IA é opcional e passa pelo Vercel AI Gateway.

- Seg–sex às 23:00 (BRT): mensagem com botões para confirmar a carona de cada um
- Dia 1 às 09:00 (BRT): relatório do mês anterior com o valor a cobrar de cada um e os dias sem confirmação
- Texto livre (com `AI_GATEWAY_API_KEY`): "deixei o Guilherme na namorada ontem, 7 reais"

## Deploy

```sh
npx wrangler login
npx wrangler d1 create caronas          # cole o database_id no wrangler.jsonc
npm run db:init
npx wrangler secret put BOT_TOKEN       # do @BotFather
npx wrangler secret put WEBHOOK_SECRET  # qualquer string aleatória (A-Z, a-z, 0-9, _ e -)
npx wrangler secret put OWNER_CHAT_ID   # veja abaixo
npx wrangler secret put AI_GATEWAY_API_KEY  # opcional
npm run deploy
```

Depois abra `https://caronas-bot.<seu-subdominio>.workers.dev/setup?secret=<WEBHOOK_SECRET>` uma vez para registrar o webhook e os comandos.

**Chat id:** com o webhook registrado e `OWNER_CHAT_ID` ainda vazio (ou errado), mande `/start` pro bot: ele responde com seu chat id. Salve com `wrangler secret put OWNER_CHAT_ID`. A partir daí o bot só responde a você.

## Uso

```
/add Henrique 3
/add Guilherme 4
/hoje            confirmar hoje
/pendentes       dias úteis do mês sem resposta
/relatorio 09/2026
```

Na mensagem do dia: ✅ usa o valor padrão, ❌ marca que não teve carona, ✏️ pede outro valor (`7 namorada`).
Dá pra clicar de novo para corrigir.
