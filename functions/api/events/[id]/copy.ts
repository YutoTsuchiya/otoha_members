// POST /api/events/:id/copy  既存の演奏をコピーする（メンバー・曲・席・色もすべてコピー）
import { idParam, json, jsonError, type EventRow } from "../../../../shared/api-helpers.ts";
import { requireAuth } from "../../../../shared/auth.ts";

export const onRequestPost: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("演奏IDが不正です", 400);

  const db = ctx.env.DB;

  // コピー元の演奏
  const src = await db
    .prepare("SELECT id, name FROM events WHERE id = ?")
    .bind(eventId)
    .first<{ id: number; name: string }>();
  if (!src) return jsonError("演奏が見つかりません", 404);

  // 新しい演奏を作成（名前は「〇〇のコピー」）
  const created = await db
    .prepare("INSERT INTO events (name) VALUES (?)")
    .bind(`${src.name}のコピー`)
    .run();
  const newEventId = created.meta.last_row_id;

  // メンバーをコピー（旧ID → 新ID の対応を控える）
  const members = await db
    .prepare("SELECT id, name FROM members WHERE event_id = ? ORDER BY id")
    .bind(eventId)
    .all<{ id: number; name: string }>();
  const memberIdMap = new Map<number, number>();
  if (members.results.length > 0) {
    const memberResults = await db.batch(
      members.results.map((m) =>
        db.prepare("INSERT INTO members (event_id, name) VALUES (?, ?)").bind(newEventId, m.name),
      ),
    );
    members.results.forEach((m, i) => memberIdMap.set(m.id, memberResults[i].meta.last_row_id));
  }

  // 曲をコピー（並び順・パート名も保持）
  const songs = await db
    .prepare("SELECT id, name, position, group_names FROM songs WHERE event_id = ? ORDER BY position, id")
    .bind(eventId)
    .all<{ id: number; name: string; position: number; group_names: string }>();
  const songIdMap = new Map<number, number>();
  if (songs.results.length > 0) {
    const songResults = await db.batch(
      songs.results.map((s) =>
        db
          .prepare("INSERT INTO songs (event_id, name, position, group_names) VALUES (?, ?, ?, ?)")
          .bind(newEventId, s.name, s.position, s.group_names),
      ),
    );
    songs.results.forEach((s, i) => songIdMap.set(s.id, songResults[i].meta.last_row_id));
  }

  // 席（song_members）をコピー（行・位置・色も保持）
  const seats = await db
    .prepare(
      "SELECT song_id, member_id, row_index, position, color FROM song_members WHERE song_id IN (SELECT id FROM songs WHERE event_id = ?)",
    )
    .bind(eventId)
    .all<{ song_id: number; member_id: number; row_index: number; position: number; color: string | null }>();
  const seatStatements = seats.results.flatMap((sr) => {
    const newSongId = songIdMap.get(sr.song_id);
    const newMemberId = memberIdMap.get(sr.member_id);
    if (newSongId === undefined || newMemberId === undefined) return [];
    return [
      db
        .prepare(
          "INSERT INTO song_members (song_id, member_id, row_index, position, color) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(newSongId, newMemberId, sr.row_index, sr.position, sr.color),
    ];
  });
  if (seatStatements.length > 0) await db.batch(seatStatements);

  // 新しい演奏を返す
  const row = await db
    .prepare("SELECT id, name, created_at FROM events WHERE id = ?")
    .bind(newEventId)
    .first<EventRow>();
  if (!row) return jsonError("演奏の作成に失敗しました", 500);

  return json(row, 201);
};
