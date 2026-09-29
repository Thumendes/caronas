import { addDays, isWeekday, todayBR } from './lib';

export interface Rider {
  id: number;
  name: string;
  default_price: number;
  active: number;
  created_on: string;
}

export interface Ride {
  rider_id: number;
  date: string;
  went: number;
  price: number;
  note: string | null;
}

export async function listRiders(db: D1Database, includeInactive = false): Promise<Rider[]> {
  const sql = includeInactive
    ? 'SELECT * FROM riders ORDER BY name'
    : 'SELECT * FROM riders WHERE active = 1 ORDER BY name';
  return (await db.prepare(sql).all<Rider>()).results;
}

export async function findRider(db: D1Database, name: string): Promise<Rider | null> {
  return db.prepare('SELECT * FROM riders WHERE name = ? COLLATE NOCASE').bind(name.trim()).first<Rider>();
}

export async function getRider(db: D1Database, id: number): Promise<Rider | null> {
  return db.prepare('SELECT * FROM riders WHERE id = ?').bind(id).first<Rider>();
}

/** Cria ou atualiza (e reativa) um caroneiro pelo nome. */
export async function saveRider(db: D1Database, name: string, price: number): Promise<Rider> {
  return (await db
    .prepare(
      `INSERT INTO riders (name, default_price, created_on) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET default_price = excluded.default_price, active = 1
       RETURNING *`,
    )
    .bind(name.trim(), price, todayBR())
    .first<Rider>())!;
}

export async function deactivateRider(db: D1Database, id: number): Promise<void> {
  await db.prepare('UPDATE riders SET active = 0 WHERE id = ?').bind(id).run();
}

export async function upsertRide(
  db: D1Database,
  ride: { riderId: number; date: string; went: boolean; price: number; note?: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO rides (rider_id, date, went, price, note) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(rider_id, date) DO UPDATE SET went = excluded.went, price = excluded.price, note = excluded.note`,
    )
    .bind(ride.riderId, ride.date, ride.went ? 1 : 0, ride.went ? ride.price : 0, ride.note ?? null)
    .run();
}

export async function ridesBetween(db: D1Database, from: string, to: string): Promise<Ride[]> {
  return (
    await db.prepare('SELECT * FROM rides WHERE date BETWEEN ? AND ? ORDER BY date').bind(from, to).all<Ride>()
  ).results;
}

/** Caroneiros que aparecem num dia: ativos cadastrados até a data + quem já tem registro nela. */
export async function ridersForDay(db: D1Database, date: string): Promise<Rider[]> {
  return (
    await db
      .prepare(
        `SELECT * FROM riders
         WHERE (active = 1 AND created_on <= ?1)
            OR id IN (SELECT rider_id FROM rides WHERE date = ?1)
         ORDER BY name`,
      )
      .bind(date)
      .all<Rider>()
  ).results;
}

/** Dias úteis entre from e to sem resposta para algum caroneiro ativo. */
export async function pendingDays(db: D1Database, from: string, to: string): Promise<Map<string, Rider[]>> {
  const riders = await listRiders(db);
  const rides = await ridesBetween(db, from, to);
  const answered = new Set(rides.map((r) => `${r.rider_id}:${r.date}`));
  const pending = new Map<string, Rider[]>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    const missing = riders.filter((r) => r.created_on <= d && !answered.has(`${r.id}:${d}`));
    if (missing.length) pending.set(d, missing);
  }
  return pending;
}

export async function getState<T>(db: D1Database, key: string): Promise<T | null> {
  const row = await db.prepare('SELECT value FROM state WHERE key = ?').bind(key).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as T) : null;
}

export async function setState(db: D1Database, key: string, value: unknown): Promise<void> {
  await db
    .prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(key, JSON.stringify(value))
    .run();
}

export async function clearState(db: D1Database, key: string): Promise<void> {
  await db.prepare('DELETE FROM state WHERE key = ?').bind(key).run();
}
