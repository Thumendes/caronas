import { Bot, type Context } from 'grammy';
import { handleFreeText } from './ai';
import {
  clearState,
  deactivateRider,
  findRider,
  getRider,
  getState,
  listRiders,
  pendingDays,
  ridersForDay,
  saveRider,
  setState,
  upsertRide,
} from './db';
import { addDays, fmtDate, money, parseDateBR, parseMoney, parseMonthBR, todayBR, type Env } from './lib';
import { renderDay, renderReport } from './views';

const HELP = `🚗 <b>Bot de caronas</b>

<b>Caroneiros</b>
/caroneiros — lista
/add Nome Valor — cadastra (ou altera valor)
/remover Nome — remove

<b>Caronas</b>
/hoje — confirmar caronas de hoje
/dia dd/mm — confirmar um dia específico
/pendentes — dias úteis do mês sem confirmação
/relatorio [mm/aaaa] — relatório do mês

Todo dia útil às 23h eu pergunto, e no dia 1 mando o relatório do mês anterior.
Também dá pra escrever normal: <i>"deixei o Guilherme na namorada, 7 reais"</i>`;

interface PendingCustom {
  riderId: number;
  date: string;
  chatId: number;
  messageId: number;
}

const CUSTOM_KEY = 'pending_custom';

export function createBot(env: Env) {
  const bot = new Bot(env.BOT_TOKEN);
  const db = env.DB;

  // Só o dono usa. Para descobrir seu chat id, mande /start antes de configurar OWNER_CHAT_ID.
  bot.use(async (ctx, next) => {
    if (String(ctx.chat?.id) === env.OWNER_CHAT_ID) return next();
    if (ctx.message?.text === '/start') await ctx.reply(`Seu chat id: ${ctx.chat?.id}`);
  });

  bot.command(['start', 'ajuda', 'help'], (ctx) => ctx.reply(HELP, { parse_mode: 'HTML' }));

  bot.command('caroneiros', async (ctx) => {
    const riders = await listRiders(db);
    if (!riders.length) return ctx.reply('Nenhum caroneiro. Use /add Nome Valor');
    await ctx.reply(riders.map((r) => `• ${r.name} — ${money(r.default_price)}`).join('\n'));
  });

  bot.command('add', async (ctx) => {
    const m = ctx.match.trim().match(/^(.+?)\s+(\S+)$/);
    const price = m && parseMoney(m[2]);
    if (!m || price == null) return ctx.reply('Uso: /add Nome Valor  (ex: /add Henrique 3)');
    const r = await saveRider(db, m[1], price);
    await ctx.reply(`✅ ${r.name} — ${money(r.default_price)}`);
  });

  bot.command('remover', async (ctx) => {
    const rider = await findRider(db, ctx.match);
    if (!rider) return ctx.reply('Não achei esse caroneiro. Veja /caroneiros');
    await deactivateRider(db, rider.id);
    await ctx.reply(`🗑️ ${rider.name} removido (o histórico continua no relatório).`);
  });

  bot.command('hoje', async (ctx) => {
    await ctx.reply(...dayMessage(await renderDay(db, todayBR())));
  });

  bot.command('dia', async (ctx) => {
    const date = parseDateBR(ctx.match);
    if (!date) return ctx.reply('Uso: /dia dd/mm');
    await ctx.reply(...dayMessage(await renderDay(db, date)));
  });

  bot.command('pendentes', async (ctx) => {
    const today = todayBR();
    const pending = await pendingDays(db, `${today.slice(0, 7)}-01`, addDays(today, -1));
    if (!pending.size) return ctx.reply('🎉 Nada pendente este mês.');
    for (const date of pending.keys()) await ctx.reply(...dayMessage(await renderDay(db, date)));
  });

  bot.command('relatorio', async (ctx) => {
    const month = ctx.match.trim() ? parseMonthBR(ctx.match) : todayBR().slice(0, 7);
    if (!month) return ctx.reply('Uso: /relatorio mm/aaaa');
    await ctx.reply(await renderReport(db, month), { parse_mode: 'HTML' });
  });

  // Botões de um caroneiro: r:<y|n|c>:<riderId>:<date>
  bot.callbackQuery(/^r:([ync]):(\d+):(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const [, action, id, date] = ctx.match;
    const rider = await getRider(db, Number(id));
    if (!rider) return ctx.answerCallbackQuery('Caroneiro não existe mais');

    if (action === 'c') {
      await setState(db, CUSTOM_KEY, {
        riderId: rider.id,
        date,
        chatId: ctx.chat!.id,
        messageId: ctx.callbackQuery.message!.message_id,
      } satisfies PendingCustom);
      await ctx.answerCallbackQuery();
      return ctx.reply(`Quanto foi a carona do ${rider.name} em ${fmtDate(date)}?\nEx: <code>7</code> ou <code>7 namorada</code>`, {
        parse_mode: 'HTML',
      });
    }

    await upsertRide(db, { riderId: rider.id, date, went: action === 'y', price: rider.default_price });
    await refreshDay(ctx, date);
  });

  // Botões do dia inteiro: a:<y|n>:<date>
  bot.callbackQuery(/^a:([yn]):(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const [, action, date] = ctx.match;
    for (const r of await ridersForDay(db, date)) {
      await upsertRide(db, { riderId: r.id, date, went: action === 'y', price: r.default_price });
    }
    await refreshDay(ctx, date);
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;

    // Resposta ao "✏️ Outro valor"
    const custom = await getState<PendingCustom>(db, CUSTOM_KEY);
    if (custom) {
      const price = parseMoney(text);
      if (price != null) {
        const note = text.replace(/^\s*(r\$\s*)?\d+([.,]\d{1,2})?\s*(reais)?\s*/i, '').trim() || null;
        await upsertRide(db, { riderId: custom.riderId, date: custom.date, went: true, price, note });
        await clearState(db, CUSTOM_KEY);
        const view = await renderDay(db, custom.date);
        await ctx.api
          .editMessageText(custom.chatId, custom.messageId, view.text, { parse_mode: 'HTML', reply_markup: view.reply_markup })
          .catch(() => {});
        return ctx.reply(`✅ Registrado: ${money(price)}${note ? ` (${note})` : ''}`);
      }
      await clearState(db, CUSTOM_KEY);
    }

    if (!env.AI_GATEWAY_API_KEY) return ctx.reply(HELP, { parse_mode: 'HTML' });
    await ctx.replyWithChatAction('typing');
    await ctx.reply(await handleFreeText(env, text));
  });

  bot.catch(async (err) => {
    console.error(err.error);
    await err.ctx.reply('⚠️ Deu erro, tenta de novo.').catch(() => {});
  });

  async function refreshDay(ctx: Context, date: string) {
    const view = await renderDay(db, date);
    await ctx.editMessageText(view.text, { parse_mode: 'HTML', reply_markup: view.reply_markup }).catch(() => {});
    await ctx.answerCallbackQuery();
  }

  return bot;
}

export function dayMessage(view: Awaited<ReturnType<typeof renderDay>>) {
  return [view.text, { parse_mode: 'HTML' as const, reply_markup: view.reply_markup }] as const;
}
