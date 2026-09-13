// GET    /api/songs/:id  曲を取得（出演メンバーIDを席順で含む）
// PATCH  /api/songs/:id  曲名の変更 / 出演メンバーの入れ替え
// DELETE /api/songs/:id  曲を削除
import {
  idParam,
  json,
  jsonError,
  readJson,
  replaceSongSeats,
  songRows,
  validateRows,
  type SongRow,
} from "../../../shared/api-helpers.ts";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("曲IDが不正です", 400);

  const row = await ctx.env.DB
    .prepare("SELECT id, event_id, name, created_at FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  if (!row) return jsonError("曲が見つかりません", 404);

  return json({ ...row, rows: await songRows(ctx.env.DB, id) });
};

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("曲IDが不正です", 400);

  const db = ctx.env.DB;
  const song = await db
    .prepare("SELECT id, event_id, name, created_at FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  if (!song) return jsonError("曲が見つかりません", 404);

  const body = await readJson(ctx.request);
  if (!body) return jsonError("リクエストの形式が不正です", 400);

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return jsonError("曲名を入力してください", 400);
    await db.prepare("UPDATE songs SET name = ? WHERE id = ?").bind(name, id).run();
  }

  if (body.rows !== undefined) {
    const invalid = await validateRows(db, song.event_id, body.rows);
    if (invalid) return jsonError(invalid, 400);
    await replaceSongSeats(db, id, body.rows as number[][]);
  }

  const row = await db
    .prepare("SELECT id, event_id, name, created_at FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();

  return json({ ...row, rows: await songRows(db, id) });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("曲IDが不正です", 400);

  const db = ctx.env.DB;
  const exists = await db.prepare("SELECT id FROM songs WHERE id = ?").bind(id).first();
  if (!exists) return jsonError("曲が見つかりません", 404);

  await db.batch([
    db.prepare("DELETE FROM song_members WHERE song_id = ?").bind(id),
    db.prepare("DELETE FROM songs WHERE id = ?").bind(id),
  ]);

  return new Response(null, { status: 204 });
};
