// GET  /api/events/:id/songs  曲一覧（出演メンバーの配置を行ごとに含む）
// POST /api/events/:id/songs  曲を作成（出演メンバーを選択）
import {
  idParam,
  json,
  jsonError,
  readJson,
  replaceSongSeats,
  songRowsFor,
  validateRows,
  type SongRow,
} from "../../../../shared/api-helpers.ts";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("イベントIDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("イベントが見つかりません", 404);

  const { results } = await db
    .prepare("SELECT id, event_id, name, created_at FROM songs WHERE event_id = ? ORDER BY id")
    .bind(eventId)
    .all<SongRow>();

  const rowsBySong = await songRowsFor(
    db,
    results.map((song) => song.id),
  );

  return json(results.map((song) => ({ ...song, rows: rowsBySong.get(song.id) ?? [] })));
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("イベントIDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("イベントが見つかりません", 404);

  const body = await readJson(ctx.request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return jsonError("曲名を入力してください", 400);

  const rows = body?.rows ?? [];
  const invalid = await validateRows(db, eventId, rows);
  if (invalid) return jsonError(invalid, 400);

  const created = await db
    .prepare("INSERT INTO songs (event_id, name) VALUES (?, ?)")
    .bind(eventId, name)
    .run();
  const songId = created.meta.last_row_id;

  const layout = rows as number[][];
  await replaceSongSeats(db, songId, layout);

  const row = await db
    .prepare("SELECT id, event_id, name, created_at FROM songs WHERE id = ?")
    .bind(songId)
    .first<SongRow>();

  return json({ ...row, rows: layout }, 201);
};
