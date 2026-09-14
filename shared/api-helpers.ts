// Pages Functions から共有するヘルパー。
// functions/ の中に置くとルートとして扱われてしまうため、この場所に置く。
// （https://developers.cloudflare.com/pages/functions/module-support/）

export interface EventRow {
  id: number;
  name: string;
  created_at: string;
}

/** 一覧用。曲数と人数を添える。 */
export interface EventSummaryRow extends EventRow {
  song_count: number;
  member_count: number;
}

export interface MemberRow {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
}

export interface SongRow {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** パスパラメータの :id を数値で取り出す。不正なら null。 */
export function idParam(params: Record<string, string | string[]>): number | null {
  const raw = params.id;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data: unknown = await request.json();
    return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** ボディの name を取り出す（前後の空白を除去）。空なら null。 */
export async function readName(request: Request): Promise<string | null> {
  const body = await readJson(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  return name.length > 0 ? name : null;
}

/**
 * 参加者IDが、整数で・重複がなく・全員そのイベントに所属しているかを確かめる。
 * 問題があればエラーメッセージ、問題なければ null を返す。
 */
async function validateMemberIds(
  db: D1Database,
  eventId: number,
  ids: number[],
): Promise<string | null> {
  if (new Set(ids).size !== ids.length) return "同じ参加者が複数回指定されています";
  if (ids.length === 0) return null;

  // placeholders は "?" のみで構成されるため、SQLインジェクションの余地はない
  const placeholders = ids.map(() => "?").join(",");
  const row = await db
    .prepare(`SELECT COUNT(*) AS count FROM members WHERE event_id = ? AND id IN (${placeholders})`)
    .bind(eventId, ...ids)
    .first<{ count: number }>();

  if (!row || row.count !== ids.length) {
    return "このイベントに登録されていない参加者が含まれています";
  }
  return null;
}

/** 行の配列（number[][]）に、その曲の全メンバーが過不足なく入っているか検証する。 */
export async function validateRows(
  db: D1Database,
  eventId: number,
  value: unknown,
): Promise<string | null> {
  if (!Array.isArray(value)) return "rows は配列で指定してください";

  const ids: number[] = [];
  for (const row of value) {
    if (!Array.isArray(row) || row.length === 0) return "空の行は指定できません";
    for (const item of row) {
      if (!Number.isInteger(item)) return "rows には整数のIDのみ指定できます";
      ids.push(item as number);
    }
  }
  return validateMemberIds(db, eventId, ids);
}

/** 曲の席を行ごとの配列で返す。 */
export async function songRows(db: D1Database, songId: number): Promise<number[][]> {
  const { results } = await db
    .prepare(
      "SELECT row_index, member_id FROM song_members WHERE song_id = ? ORDER BY row_index, position",
    )
    .bind(songId)
    .all<{ row_index: number; member_id: number }>();

  return groupRows(results);
}

/** 複数曲分の席を行ごとの配列でまとめて取得する。 */
export async function songRowsFor(
  db: D1Database,
  songIds: number[],
): Promise<Map<number, number[][]>> {
  const map = new Map<number, number[][]>(songIds.map((id) => [id, []]));
  if (songIds.length === 0) return map;

  const placeholders = songIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT song_id, row_index, member_id FROM song_members
       WHERE song_id IN (${placeholders})
       ORDER BY song_id, row_index, position`,
    )
    .bind(...songIds)
    .all<{ song_id: number; row_index: number; member_id: number }>();

  for (const songId of songIds) {
    map.set(
      songId,
      groupRows(results.filter((row) => row.song_id === songId)),
    );
  }
  return map;
}

/** イベントの曲を表示順（position, id）で返し、各行の席も添える。 */
export async function listSongsWithRows(
  db: D1Database,
  eventId: number,
): Promise<(SongRow & { rows: number[][] })[]> {
  const { results } = await db
    .prepare("SELECT id, event_id, name, created_at FROM songs WHERE event_id = ? ORDER BY position, id")
    .bind(eventId)
    .all<SongRow>();

  const rowsBySong = await songRowsFor(
    db,
    results.map((song) => song.id),
  );
  return results.map((song) => ({ ...song, rows: rowsBySong.get(song.id) ?? [] }));
}

function groupRows(rows: { row_index: number; member_id: number }[]): number[][] {
  const layout: number[][] = [];
  for (const row of rows) {
    while (layout.length <= row.row_index) layout.push([]);
    layout[row.row_index].push(row.member_id);
  }
  return layout.filter((line) => line.length > 0);
}

/** 曲の席を丸ごと置き換える（全置換なので何度実行しても同じ結果になる）。 */
export async function replaceSongSeats(
  db: D1Database,
  songId: number,
  rows: number[][],
): Promise<void> {
  const statements = [
    db.prepare("DELETE FROM song_members WHERE song_id = ?").bind(songId),
    ...rows.flatMap((row, rowIndex) =>
      row.map((memberId, position) =>
        db
          .prepare(
            "INSERT INTO song_members (song_id, member_id, row_index, position) VALUES (?, ?, ?, ?)",
          )
          .bind(songId, memberId, rowIndex, position),
      ),
    ),
  ];
  await db.batch(statements);
}
