// GET  /api/events/:id/members  演奏の参加者一覧
// POST /api/events/:id/members  参加者を1人追加
import { idParam, json, jsonError, readName, type MemberRow } from "../../../../shared/api-helpers.ts";
import { requireAuth } from "../../../../shared/auth.ts";

export const onRequestGet: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("演奏IDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("演奏が見つかりません", 404);

  const { results } = await db
    .prepare("SELECT id, event_id, name, created_at FROM members WHERE event_id = ? ORDER BY id")
    .bind(eventId)
    .all<MemberRow>();

  return json(results);
};

export const onRequestPost: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("演奏IDが不正です", 400);

  const name = await readName(ctx.request);
  if (!name) return jsonError("参加者の名前を入力してください", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("演奏が見つかりません", 404);

  const created = await db
    .prepare("INSERT INTO members (event_id, name) VALUES (?, ?)")
    .bind(eventId, name)
    .run();
  const row = await db
    .prepare("SELECT id, event_id, name, created_at FROM members WHERE id = ?")
    .bind(created.meta.last_row_id)
    .first<MemberRow>();

  return json(row, 201);
};
