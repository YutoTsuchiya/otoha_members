// GET    /api/events/:id  イベント取得
// PATCH  /api/events/:id  イベント名の変更
// DELETE /api/events/:id  イベント削除（メンバー・曲・席順もまとめて削除）
import { idParam, json, jsonError, readName, type EventRow } from "../../../shared/api-helpers.ts";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("イベントIDが不正です", 400);

  const row = await ctx.env.DB.prepare("SELECT id, name, created_at FROM events WHERE id = ?")
    .bind(id)
    .first<EventRow>();
  if (!row) return jsonError("イベントが見つかりません", 404);

  return json(row);
};

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("イベントIDが不正です", 400);

  const name = await readName(ctx.request);
  if (!name) return jsonError("イベント名を入力してください", 400);

  const db = ctx.env.DB;
  const exists = await db.prepare("SELECT id FROM events WHERE id = ?").bind(id).first();
  if (!exists) return jsonError("イベントが見つかりません", 404);

  await db.prepare("UPDATE events SET name = ? WHERE id = ?").bind(name, id).run();
  const row = await db.prepare("SELECT id, name, created_at FROM events WHERE id = ?")
    .bind(id)
    .first<EventRow>();

  return json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("イベントIDが不正です", 400);

  const db = ctx.env.DB;
  const exists = await db.prepare("SELECT id FROM events WHERE id = ?").bind(id).first();
  if (!exists) return jsonError("イベントが見つかりません", 404);

  // 外部キーのカスケードに頼らず、子テーブルから順に明示的に削除する
  await db.batch([
    db
      .prepare(
        "DELETE FROM song_members WHERE song_id IN (SELECT id FROM songs WHERE event_id = ?)",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM song_members WHERE member_id IN (SELECT id FROM members WHERE event_id = ?)",
      )
      .bind(id),
    db.prepare("DELETE FROM songs WHERE event_id = ?").bind(id),
    db.prepare("DELETE FROM members WHERE event_id = ?").bind(id),
    db.prepare("DELETE FROM events WHERE id = ?").bind(id),
  ]);

  return new Response(null, { status: 204 });
};
