// Today's and tomorrow's 25Live bookings for the general-purpose classrooms the empty-room finder lists, read
// by the background run a few dozen rooms at a time: each run refreshes the rooms read longest ago (at most
// every two hours each), so the whole set takes a few runs and 25Live sees about one request per run.
// Only the times are kept, never what a booking is for. If 25Live cannot be read, /rooms falls back to the
// weekly Testudo class times on its own (rooms without a fresh row are simply not in the bookings map).

import { env } from "cloudflare:workers";
import { ROOM_DATA } from "@/lib/room-data";
import buildings from "@/data/umd-buildings.json";
import { easternClock, usableRooms, type Bookings, type Position } from "@/lib/rooms";

const LIVE = "https://25live.collegenet.com/25live/data/umd/run";
export const ROOMS_PER_REQUEST = 40;
const REFRESH_MS = 2 * 3_600_000;
// Older than this, a day's rows are not trusted (the background run may have stopped).
export const FRESH_MS = 6 * 3_600_000;

const LIVE_IDS = [...new Set(usableRooms(ROOM_DATA, buildings as Record<string, Position>).flatMap((room) => room.liveId === null ? [] : [room.liveId]))];

// "2026-10-14" -> "20261014", and the Eastern date a day later.
const compact = (date: string) => date.replaceAll("-", "");
export function nextDate(date: string) {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

type Reservation = { reservation_start_dt?: string; reservation_end_dt?: string; spaces?: { space_id?: number } | Array<{ space_id?: number }> };

// 25Live's reservations -> { "2026-10-14": { 3031: [[540, 590], ...] } }, times as written (Eastern), merged
// where they overlap. A booking running past midnight ends at midnight.
export function bookingsByDay(rows: Reservation[]) {
  const result = new Map<string, Map<number, Array<[number, number]>>>();
  const minute = (stamp: string) => Number(stamp.slice(11, 13)) * 60 + Number(stamp.slice(14, 16));
  for (const row of rows) {
    const start = row.reservation_start_dt ?? "", end = row.reservation_end_dt ?? "";
    const spaces = Array.isArray(row.spaces) ? row.spaces : row.spaces ? [row.spaces] : [];
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(end)) continue;
    const day = start.slice(0, 10);
    const from = minute(start), to = end.slice(0, 10) === day ? minute(end) : 24 * 60;
    if (to <= from) continue;
    for (const space of spaces) {
      if (typeof space.space_id !== "number") continue;
      const byRoom = result.get(day) ?? new Map<number, Array<[number, number]>>();
      byRoom.set(space.space_id, [...(byRoom.get(space.space_id) ?? []), [from, to]]);
      result.set(day, byRoom);
    }
  }
  for (const byRoom of result.values()) for (const [id, slots] of byRoom) {
    const merged: Array<[number, number]> = [];
    for (const [from, to] of slots.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
      const last = merged.at(-1);
      if (last && from <= last[1]) last[1] = Math.max(last[1], to);
      else merged.push([from, to]);
    }
    byRoom.set(id, merged);
  }
  return result;
}

// One refresh: the up to 40 rooms whose today row is oldest (or missing), read for today and tomorrow.
export async function syncRoomBookings(now = new Date(), fetcher: typeof fetch = fetch, ids = LIVE_IDS) {
  if (!env.DB || !ids.length) return { synced: 0 };
  const today = easternClock(now).date, tomorrow = nextDate(today);
  const rows = (await env.DB.prepare("SELECT space_id, synced_at FROM room_booking_days WHERE day = ?").bind(today).all<{ space_id: number; synced_at: string }>()).results ?? [];
  const synced = new Map(rows.map((row) => [row.space_id, Date.parse(row.synced_at)]));
  const due = ids.filter((id) => !(now.getTime() - (synced.get(id) ?? 0) < REFRESH_MS))
    .sort((a, b) => (synced.get(a) ?? 0) - (synced.get(b) ?? 0) || a - b).slice(0, ROOMS_PER_REQUEST);
  if (!due.length) return { synced: 0 };
  const response = await fetcher(`${LIVE}/rm_reservations.json?space_id=${due.join("+")}&start_dt=${compact(today)}&end_dt=${compact(tomorrow)}`, {
    headers: { "User-Agent": "TerpPlan empty-room finder (terpplan.com)" }, signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`25Live returned ${response.status}`);
  const body = await response.json() as { space_reservations?: { space_reservation?: Reservation | Reservation[] } };
  const list = body.space_reservations?.space_reservation ?? [];
  const byDay = bookingsByDay(Array.isArray(list) ? list : [list]);
  const at = now.toISOString();
  await env.DB.batch([
    ...[today, tomorrow].flatMap((day) => due.map((id) => env.DB!.prepare("INSERT OR REPLACE INTO room_booking_days (space_id, day, slots, synced_at) VALUES (?, ?, ?, ?)")
      .bind(id, day, JSON.stringify(byDay.get(day)?.get(id) ?? []), at))),
    env.DB.prepare("DELETE FROM room_booking_days WHERE day < ?").bind(today),
  ]);
  return { synced: due.length };
}

// A day's bookings read in the last six hours, for /rooms and the home page; `syncedAt` is the oldest read.
export async function bookingsFor(date: string, now = new Date()): Promise<{ bookings: Bookings; syncedAt: string | null }> {
  if (!env.DB) return { bookings: new Map(), syncedAt: null };
  const rows = (await env.DB.prepare("SELECT space_id, slots, synced_at FROM room_booking_days WHERE day = ? AND synced_at >= ?")
    .bind(date, new Date(now.getTime() - FRESH_MS).toISOString()).all<{ space_id: number; slots: string; synced_at: string }>()).results ?? [];
  const bookings: Bookings = new Map();
  for (const row of rows) {
    try { bookings.set(row.space_id, JSON.parse(row.slots) as Array<[number, number]>); } catch { /* skipped: falls back to the class times */ }
  }
  return { bookings, syncedAt: rows.length ? rows.map((row) => row.synced_at).sort()[0]! : null };
}
