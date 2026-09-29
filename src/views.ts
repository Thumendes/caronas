import { InlineKeyboard } from 'grammy';
import { pendingDays, ridersForDay, ridesBetween } from './db';
import { addDays, fmtDate, fmtMonth, money, todayBR } from './lib';

/** Mensagem de confirmação de um dia, com botões por caroneiro. */
export async function renderDay(db: D1Database, date: string) {
  const riders = await ridersForDay(db, date);
  const rides = new Map((await ridesBetween(db, date, date)).map((r) => [r.rider_id, r]));

  const lines = [`🚗 <b>Caronas — ${fmtDate(date)}</b>`, ''];
  const kb = new InlineKeyboard();
  let total = 0;

  for (const r of riders) {
    const ride = rides.get(r.id);
    if (!ride) lines.push(`❔ ${r.name} <i>(padrão ${money(r.default_price)})</i>`);
    else if (ride.went) {
      total += ride.price;
      lines.push(`✅ ${r.name} — ${money(ride.price)}${ride.note ? ` <i>(${ride.note})</i>` : ''}`);
    } else lines.push(`❌ ${r.name}`);

    kb.text(`✅ ${r.name} ${money(r.default_price)}`, `r:y:${r.id}:${date}`)
      .text('❌', `r:n:${r.id}:${date}`)
      .text('✏️ Outro', `r:c:${r.id}:${date}`)
      .row();
  }

  if (!riders.length) lines.push('Nenhum caroneiro cadastrado. Use /add Nome Valor');
  else {
    kb.text('✅ Todos no padrão', `a:y:${date}`).text('🚫 Ninguém', `a:n:${date}`);
    if (total) lines.push('', `Total do dia: <b>${money(total)}</b>`);
  }

  return { text: lines.join('\n'), reply_markup: kb };
}

/** Relatório do mês (YYYY-MM): quanto cobrar de cada um + dias pendentes. */
export async function renderReport(db: D1Database, month: string) {
  const from = `${month}-01`;
  const monthEnd = addDays(`${addDays(from, 32).slice(0, 7)}-01`, -1);
  const today = todayBR();
  // Dias pendentes só contam até ontem (hoje ainda vai ser confirmado às 23h).
  const pendingUntil = monthEnd < today ? monthEnd : addDays(today, -1);

  const rides = await ridesBetween(db, from, monthEnd);
  const riders = new Map(
    (await db.prepare('SELECT * FROM riders').all<{ id: number; name: string; default_price: number }>()).results.map(
      (r) => [r.id, r],
    ),
  );

  const byRider = new Map<number, typeof rides>();
  for (const ride of rides.filter((r) => r.went)) {
    byRider.set(ride.rider_id, [...(byRider.get(ride.rider_id) ?? []), ride]);
  }

  const lines = [`📊 <b>Relatório de caronas — ${fmtMonth(month)}</b>`, ''];
  let grand = 0;

  for (const [riderId, list] of [...byRider].sort((a, b) =>
    riders.get(a[0])!.name.localeCompare(riders.get(b[0])!.name),
  )) {
    const rider = riders.get(riderId)!;
    const sum = list.reduce((s, r) => s + r.price, 0);
    grand += sum;
    lines.push(`👤 <b>${rider.name}</b>: ${list.length} carona(s) → <b>${money(sum)}</b>`);
    const extras = list.filter((r) => r.price !== rider.default_price || r.note);
    for (const e of extras) {
      lines.push(`   • ${fmtDate(e.date)}: ${money(e.price)}${e.note ? ` (${e.note})` : ''}`);
    }
  }

  if (!byRider.size) lines.push('Nenhuma carona registrada.');
  else lines.push('', `💰 Total a receber: <b>${money(grand)}</b>`);

  if (pendingUntil >= from) {
    const pending = await pendingDays(db, from, pendingUntil);
    if (pending.size) {
      lines.push('', '⚠️ <b>Dias sem confirmação</b> (use /pendentes):');
      for (const [d, rs] of pending) lines.push(`   • ${fmtDate(d)}: ${rs.map((r) => r.name).join(', ')}`);
    }
  }

  return lines.join('\n');
}
