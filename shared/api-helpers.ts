// Workers から共有するヘルパー。
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
  /** 3色のパート名を JSON 文字列で保持。 */
  group_names?: string;
}

/** 色分けの1パート（色キーと表示名）。 */
export interface Part {
  color: string;
  name: string;
}

/** 曲の席と、メンバーごとの色。 */
export interface SongSeats {
  rows: number[][];
  colors: Record<number, string>;
}

/** group_names の JSON 文字列をパートの配列に変換する（不正は空配列に）。 */
export function parseParts(raw: string | null | undefined): Part[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((p) => ({
        color: typeof p.color === "string" ? p.color : "",
        name: typeof p.name === "string" ? p.name : "",
      }))
      .filter((p) => p.color !== "");
  } catch {
    return [];
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/** 閲覧用URLの共有トークンを生成する（ランダムな16進文字列）。 */
export function randomToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
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
 * 参加者IDが、整数で・重複がなく・全員その演奏に所属しているかを確かめる。
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
    return "この演奏に登録されていない参加者が含まれています";
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

/** song_members の1行。 */
interface SeatRow {
  row_index: number;
  member_id: number;
  color: string | null;
}

/** 曲の席を行ごとの配列と、メンバーごとの色を返す。 */
export async function songRows(db: D1Database, songId: number): Promise<SongSeats> {
  const { results } = await db
    .prepare(
      "SELECT row_index, member_id, color FROM song_members WHERE song_id = ? ORDER BY row_index, position",
    )
    .bind(songId)
    .all<SeatRow>();

  return { rows: groupRows(results), colors: colorsFrom(results) };
}

/** 複数曲分の席と色をまとめて取得する。 */
export async function songRowsFor(
  db: D1Database,
  songIds: number[],
): Promise<Map<number, SongSeats>> {
  const map = new Map<number, SongSeats>();
  for (const songId of songIds) map.set(songId, { rows: [], colors: {} });
  if (songIds.length === 0) return map;

  const placeholders = songIds.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT song_id, row_index, member_id, color FROM song_members
       WHERE song_id IN (${placeholders})
       ORDER BY song_id, row_index, position`,
    )
    .bind(...songIds)
    .all<SeatRow & { song_id: number }>();

  for (const songId of songIds) {
    const rows = results.filter((row) => row.song_id === songId);
    map.set(songId, { rows: groupRows(rows), colors: colorsFrom(rows) });
  }
  return map;
}

/** 演奏の曲を表示順（position, id）で返し、各行の席と色・パート名も添える。 */
export async function listSongsWithRows(
  db: D1Database,
  eventId: number,
): Promise<(SongRow & { rows: number[][]; colors: Record<number, string>; parts: Part[] })[]> {
  const { results } = await db
    .prepare("SELECT id, event_id, name, created_at, group_names FROM songs WHERE event_id = ? ORDER BY position, id")
    .bind(eventId)
    .all<SongRow>();

  const seatsBySong = await songRowsFor(
    db,
    results.map((song) => song.id),
  );
  return results.map((song) => {
    const seats = seatsBySong.get(song.id) ?? { rows: [], colors: {} };
    return {
      ...song,
      rows: seats.rows,
      colors: seats.colors,
      parts: parseParts(song.group_names),
    };
  });
}

function groupRows(rows: SeatRow[]): number[][] {
  const layout: number[][] = [];
  for (const row of rows) {
    while (layout.length <= row.row_index) layout.push([]);
    layout[row.row_index].push(row.member_id);
  }
  return layout.filter((line) => line.length > 0);
}

function colorsFrom(rows: SeatRow[]): Record<number, string> {
  const colors: Record<number, string> = {};
  for (const row of rows) {
    if (row.color) colors[row.member_id] = row.color;
  }
  return colors;
}

/** 曲の席を丸ごと置き換える（全置換なので何度実行しても同じ結果になる）。色は保持する。 */
export async function replaceSongSeats(
  db: D1Database,
  songId: number,
  rows: number[][],
): Promise<void> {
  // 並び替えでも色を保持できるよう、既存の色を先に控えておく
  const existing = await db
    .prepare("SELECT member_id, color FROM song_members WHERE song_id = ?")
    .bind(songId)
    .all<{ member_id: number; color: string | null }>();
  const colorByMember = new Map(existing.results.map((r) => [r.member_id, r.color]));

  const statements = [
    db.prepare("DELETE FROM song_members WHERE song_id = ?").bind(songId),
    ...rows.flatMap((row, rowIndex) =>
      row.map((memberId, position) =>
        db
          .prepare(
            "INSERT INTO song_members (song_id, member_id, row_index, position, color) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(songId, memberId, rowIndex, position, colorByMember.get(memberId) ?? null),
      ),
    ),
  ];
  await db.batch(statements);
}

/** パート一覧（色と名前）を更新する。 */
export async function updateSongParts(
  db: D1Database,
  songId: number,
  parts: Part[],
): Promise<void> {
  await db
    .prepare("UPDATE songs SET group_names = ? WHERE id = ?")
    .bind(JSON.stringify(parts), songId)
    .run();
}

/** メンバーごとの色を更新する（未割当は null）。 */
export async function updateSongColors(
  db: D1Database,
  songId: number,
  colors: Record<number, string | null>,
): Promise<void> {
  const statements = Object.entries(colors).map(([memberId, color]) =>
    db
      .prepare("UPDATE song_members SET color = ? WHERE song_id = ? AND member_id = ?")
      .bind(color ?? null, songId, Number(memberId)),
  );
  if (statements.length > 0) await db.batch(statements);
}
