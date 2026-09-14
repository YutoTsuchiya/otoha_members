// GET    /api/songs/:id  曲を取得（席順・色・パート名を含む）
// PATCH  /api/songs/:id  曲名の変更 / 出演メンバー・色・パート名の変更
// DELETE /api/songs/:id  曲を削除
import {
  idParam,
  json,
  jsonError,
  parseParts,
  readJson,
  replaceSongSeats,
  songRows,
  updateSongColors,
  updateSongParts,
  validateRows,
  type Part,
  type SongRow,
} from "../../../shared/api-helpers.ts";
import { requireAuth } from "../../../shared/auth.ts";

export const onRequestGet: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const id = idParam(ctx.params);
  if (id === null) return jsonError("曲IDが不正です", 400);

  const row = await ctx.env.DB
    .prepare("SELECT id, event_id, name, created_at, group_names FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  if (!row) return jsonError("曲が見つかりません", 404);

  const seats = await songRows(ctx.env.DB, id);
  return json({
    ...row,
    rows: seats.rows,
    colors: seats.colors,
    parts: parseParts(row.group_names),
  });
};

export const onRequestPatch: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

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
    await replaceSongSeats(db, id, body.rows as (number | null)[][]);
  }

  if (body.parts !== undefined) {
    const parts = body.parts;
    if (!Array.isArray(parts)) {
      return jsonError("parts の形式が不正です", 400);
    }
    const validParts: Part[] = parts
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((p) => ({
        color: typeof p.color === "string" ? p.color.trim() : "",
        name: typeof p.name === "string" ? p.name.trim() : "",
      }))
      .filter((p) => p.color !== "");
    await updateSongParts(db, id, validParts);
  }

  if (body.colors !== undefined) {
    const colors = body.colors;
    if (typeof colors !== "object" || colors === null) {
      return jsonError("colors の形式が不正です", 400);
    }
    const valid: Record<number, string | null> = {};
    for (const [memberId, color] of Object.entries(colors as Record<string, unknown>)) {
      const mid = Number(memberId);
      if (!Number.isInteger(mid)) return jsonError("colors のメンバーIDが不正です", 400);
      if (color === null || color === undefined) {
        valid[mid] = null;
      } else if (typeof color === "string" && color.trim() !== "") {
        valid[mid] = color;
      } else {
        return jsonError("colors の値が不正です", 400);
      }
    }
    await updateSongColors(db, id, valid);
  }

  const row = await db
    .prepare("SELECT id, event_id, name, created_at, group_names FROM songs WHERE id = ?")
    .bind(id)
    .first<SongRow>();
  if (!row) return jsonError("曲が見つかりません", 404);

  const seats = await songRows(db, id);
  return json({
    ...row,
    rows: seats.rows,
    colors: seats.colors,
    parts: parseParts(row.group_names),
  });
};

export const onRequestDelete: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

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
