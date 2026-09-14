// GET  /api/events/:id/songs  曲一覧（表示順で、出演メンバーの配置を行ごとに含む）
// POST /api/events/:id/songs  曲を作成（出演メンバーを選択）
// PUT  /api/events/:id/songs  曲の並び順を更新（ids を表示順に）
import {
  idParam,
  json,
  jsonError,
  listSongsWithRows,
  readJson,
  replaceSongSeats,
  validateRows,
  type SongRow,
} from "../../../../shared/api-helpers.ts";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("イベントIDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("イベントが見つかりません", 404);

  return json(await listSongsWithRows(db, eventId));
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

  const next = await db
    .prepare("SELECT COALESCE(MAX(position), 0) + 1 AS position FROM songs WHERE event_id = ?")
    .bind(eventId)
    .first<{ position: number }>();

  const created = await db
    .prepare("INSERT INTO songs (event_id, name, position) VALUES (?, ?, ?)")
    .bind(eventId, name, next?.position ?? 0)
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

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("イベントIDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("イベントが見つかりません", 404);

  const body = await readJson(ctx.request);
  const ids = body?.ids;
  if (!Array.isArray(ids)) return jsonError("ids は配列で指定してください", 400);
  for (const id of ids) {
    if (!Number.isInteger(id)) return jsonError("ids には整数のIDのみ指定できます", 400);
  }
  const songIds = ids as number[];
  if (new Set(songIds).size !== songIds.length) {
    return jsonError("同じ曲が複数回指定されています", 400);
  }

  // 指定された曲が、このイベントの全曲とちょうど一致するか
  const total = await db
    .prepare("SELECT COUNT(*) AS count FROM songs WHERE event_id = ?")
    .bind(eventId)
    .first<{ count: number }>();
  if (!total || songIds.length !== total.count) {
    return jsonError("イベントの全曲を指定してください", 400);
  }

  if (songIds.length > 0) {
    const placeholders = songIds.map(() => "?").join(",");
    const row = await db
      .prepare(`SELECT COUNT(*) AS count FROM songs WHERE event_id = ? AND id IN (${placeholders})`)
      .bind(eventId, ...songIds)
      .first<{ count: number }>();
    if (!row || row.count !== songIds.length) {
      return jsonError("このイベントに存在しない曲が含まれています", 400);
    }
  }

  // 表示順を配列の並びに振り直す
  await db.batch(
    songIds.map((id, index) =>
      db.prepare("UPDATE songs SET position = ? WHERE id = ?").bind(index, id),
    ),
  );

  return json(await listSongsWithRows(db, eventId));
};
