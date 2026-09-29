import { webhookCallback } from 'grammy';
import { createBot, dayMessage } from './bot';
import { previousMonth, todayBR, type Env } from './lib';
import { renderDay, renderReport } from './views';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Abra /setup?secret=WEBHOOK_SECRET uma vez depois do deploy para registrar o webhook.
    if (url.pathname === '/setup') {
      if (url.searchParams.get('secret') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
      const bot = createBot(env);
      await bot.api.setWebhook(`${url.origin}/webhook`, { secret_token: env.WEBHOOK_SECRET });
      await bot.api.setMyCommands([
        { command: 'hoje', description: 'Confirmar caronas de hoje' },
        { command: 'pendentes', description: 'Dias sem confirmação' },
        { command: 'relatorio', description: 'Relatório do mês' },
        { command: 'caroneiros', description: 'Listar caroneiros' },
        { command: 'add', description: 'Cadastrar: /add Nome Valor' },
        { command: 'dia', description: 'Confirmar um dia: /dia dd/mm' },
        { command: 'remover', description: 'Remover caroneiro' },
        { command: 'ajuda', description: 'Ajuda' },
      ]);
      return new Response('webhook ok');
    }

    if (url.pathname === '/webhook' && req.method === 'POST') {
      return webhookCallback(createBot(env), 'cloudflare-mod', {
        secretToken: env.WEBHOOK_SECRET,
        timeoutMilliseconds: 55_000, // chamadas de IA podem passar dos 10s padrão
      })(req);
    }

    return new Response('caronas-bot');
  },

  async scheduled(event, env) {
    const bot = createBot(env);
    if (event.cron === '0 12 1 * *') {
      await bot.api.sendMessage(env.OWNER_CHAT_ID, await renderReport(env.DB, previousMonth()), { parse_mode: 'HTML' });
    } else {
      await bot.api.sendMessage(env.OWNER_CHAT_ID, ...dayMessage(await renderDay(env.DB, todayBR())));
    }
  },
} satisfies ExportedHandler<Env>;
