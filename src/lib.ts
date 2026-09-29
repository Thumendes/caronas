export interface Env {
  DB: D1Database;
  BOT_TOKEN: string;
  OWNER_CHAT_ID: string;
  WEBHOOK_SECRET: string;
  AI_GATEWAY_API_KEY?: string;
  AI_MODEL: string;
}

// Brasil não tem mais horário de verão: BRT é sempre UTC-3.
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export function todayBR(now = Date.now()): string {
  return new Date(now - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function isWeekday(date: string): boolean {
  const w = weekday(date);
  return w >= 1 && w <= 5;
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function fmtDate(date: string): string {
  const [, m, d] = date.split('-');
  return `${WEEKDAYS[weekday(date)]} ${d}/${m}`;
}

export function fmtMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
}

export function money(cents: number): string {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
}

/** "7", "7,50", "R$ 7.5" → centavos. */
export function parseMoney(input: string): number | null {
  const m = input.replace(/r\$\s*/i, '').trim().match(/^(\d+(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(',', '.')) * 100);
}

/** "dd/mm" ou "dd/mm/aaaa" → YYYY-MM-DD (ano atual se omitido). */
export function parseDateBR(input: string, today = todayBR()): string | null {
  const m = input.trim().match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  const year = m[3] ?? today.slice(0, 4);
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** "mm/aaaa" ou "mm" → YYYY-MM. */
export function parseMonthBR(input: string, today = todayBR()): string | null {
  const m = input.trim().match(/^(\d{1,2})(?:\/(\d{4}))?$/);
  if (!m) return null;
  return `${m[2] ?? today.slice(0, 4)}-${m[1].padStart(2, '0')}`;
}

export function previousMonth(today = todayBR()): string {
  return addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
}
