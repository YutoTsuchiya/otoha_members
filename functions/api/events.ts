// GET  /api/events  演奏一覧
// POST /api/events  演奏作成
import { json, jsonError, readName, type EventRow, type EventSummaryRow } from "../../shared/api-helpers.ts";
import { requireAuth } from "../../shared/auth.ts";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  // 一覧では曲数と人数も返す
  const { results } = await ctx.env.DB.prepare(
    `SELECT e.id, e.name, e.created_at,
            (SELECT COUNT(*) FROM members m WHERE m.event_id = e.id) AS member_count,
            (SELECT COUNT(*) FROM songs s WHERE s.event_id = e.id) AS song_count
     FROM events e
     ORDER BY e.id DESC`,
  ).all<EventSummaryRow>();
  return json(results);
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const name = await readName(ctx.request);
  if (!name) return jsonError("演奏名を入力してください", 400);

  const created = await ctx.env.DB.prepare("INSERT INTO events (name) VALUES (?)")
    .bind(name)
    .run();
  const row = await ctx.env.DB.prepare("SELECT id, name, created_at FROM events WHERE id = ?")
    .bind(created.meta.last_row_id)
    .first<EventRow>();

  return json(row, 201);
};
