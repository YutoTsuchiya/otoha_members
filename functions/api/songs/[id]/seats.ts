// PUT /api/songs/:id/seats  席の配置を保存する（行の配列がそのまま配置になる）
import {
  idParam,
  json,
  jsonError,
  readJson,
  replaceSongSeats,
  validateRows,
} from "../../../../shared/api-helpers.ts";
import { requireAuth } from "../../../../shared/auth.ts";

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const songId = idParam(ctx.params);
  if (songId === null) return jsonError("曲IDが不正です", 400);

  const db = ctx.env.DB;
  const song = await db
    .prepare("SELECT id, event_id FROM songs WHERE id = ?")
    .bind(songId)
    .first<{ id: number; event_id: number }>();
  if (!song) return jsonError("曲が見つかりません", 404);

  const body = await readJson(ctx.request);
  if (!body || body.rows === undefined) {
    return jsonError("rows を指定してください", 400);
  }

  const invalid = await validateRows(db, song.event_id, body.rows);
  if (invalid) return jsonError(invalid, 400);

  const rows = body.rows as number[][];
  await replaceSongSeats(db, songId, rows);

  return json({ rows });
};
