// GET /api/share/:token  閲覧用URL（読み取り専用）。パスワード不要で演奏の内容を返す。
import { json, jsonError, listSongsWithRows, type MemberRow } from "../../../shared/api-helpers.ts";

export const onRequestGet: ApiHandler = async (ctx) => {
  const raw = ctx.params.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  if (!token) return jsonError("トークンが不正です", 400);

  const db = ctx.env.DB;
  const event = await db
    .prepare("SELECT id, name FROM events WHERE share_token = ?")
    .bind(token)
    .first<{ id: number; name: string }>();
  if (!event) return jsonError("このURLは無効です", 404);

  const { results: members } = await db
    .prepare("SELECT id, event_id, name, created_at FROM members WHERE event_id = ? ORDER BY id")
    .bind(event.id)
    .all<MemberRow>();

  const songs = await listSongsWithRows(db, event.id);

  return json({ event, members, songs });
};
