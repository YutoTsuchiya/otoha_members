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
  rows: (number | null)[][];
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
      if (item === null) continue; // 空席
      if (!Number.isInteger(item) || (item as number) <= 0) return "rows には正の整数IDのみ指定できます";
      ids.push(item as number);
    }
  }
  return validateMemberIds(db, eventId, ids);
}

/** song_members の1行。 */
interface SeatRow {
  row_index: number;
  member_id: number | null;
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
): Promise<(SongRow & { rows: (number | null)[][]; colors: Record<number, string>; parts: Part[] })[]> {
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

function groupRows(rows: SeatRow[]): (number | null)[][] {
  const layout: (number | null)[][] = [];
  for (const row of rows) {
    while (layout.length <= row.row_index) layout.push([]);
    layout[row.row_index].push(row.member_id);
  }
  return layout.filter((line) => line.length > 0);
}

function colorsFrom(rows: SeatRow[]): Record<number, string> {
  const colors: Record<number, string> = {};
  for (const row of rows) {
    if (row.color && row.member_id !== null) colors[row.member_id] = row.color;
  }
  return colors;
}

/** 曲の席を差分で更新する（変更のあった行だけ書く）。既存の席の色は維持される。 */
export async function replaceSongSeats(
  db: D1Database,
  songId: number,
  rows: (number | null)[][],
): Promise<void> {
  // 現在の席を読み、メンバー（member_id）と空席（NULL）に分ける
  const existing = await db
    .prepare("SELECT id, member_id, row_index, position FROM song_members WHERE song_id = ?")
    .bind(songId)
    .all<{ id: number; member_id: number | null; row_index: number; position: number }>();

  const existingByMember = new Map<number, { id: number; row_index: number; position: number }>();
  const existingEmpty: { row_index: number; position: number }[] = [];
  for (const seat of existing.results) {
    if (seat.member_id === null) {
      existingEmpty.push({ row_index: seat.row_index, position: seat.position });
    } else {
      existingByMember.set(seat.member_id, {
        id: seat.id,
        row_index: seat.row_index,
        position: seat.position,
      });
    }
  }

  // 新しい配置を、メンバー（member_id → 位置）と空席（位置の列）に分ける
  const desiredMembers = new Map<number, { row_index: number; position: number }>();
  const desiredEmpty: { row_index: number; position: number }[] = [];
  rows.forEach((row, rowIndex) => {
    row.forEach((memberId, position) => {
      if (memberId === null) desiredEmpty.push({ row_index: rowIndex, position });
      else desiredMembers.set(memberId, { row_index: rowIndex, position });
    });
  });

  const statements: D1PreparedStatement[] = [];

  // メンバーの差分: 新規は INSERT、移動は UPDATE、消えた人は DELETE
  for (const [memberId, pos] of desiredMembers) {
    const current = existingByMember.get(memberId);
    if (!current) {
      statements.push(
        db
          .prepare(
            "INSERT INTO song_members (song_id, member_id, row_index, position, color) VALUES (?, ?, ?, ?, NULL)",
          )
          .bind(songId, memberId, pos.row_index, pos.position),
      );
    } else if (current.row_index !== pos.row_index || current.position !== pos.position) {
      statements.push(
        db
          .prepare("UPDATE song_members SET row_index = ?, position = ? WHERE id = ?")
          .bind(pos.row_index, pos.position, current.id),
      );
    }
  }
  for (const [memberId, current] of existingByMember) {
    if (!desiredMembers.has(memberId)) {
      statements.push(db.prepare("DELETE FROM song_members WHERE id = ?").bind(current.id));
    }
  }

  // 空席は識別子がないため、変化があれば全削除 → 全追加で揃える
  const byPos = (
    a: { row_index: number; position: number },
    b: { row_index: number; position: number },
  ) => a.row_index - b.row_index || a.position - b.position;
  existingEmpty.sort(byPos);
  desiredEmpty.sort(byPos);
  const emptyChanged =
    existingEmpty.length !== desiredEmpty.length ||
    existingEmpty.some(
      (seat, i) => seat.row_index !== desiredEmpty[i].row_index || seat.position !== desiredEmpty[i].position,
    );
  if (emptyChanged) {
    statements.push(
      db.prepare("DELETE FROM song_members WHERE song_id = ? AND member_id IS NULL").bind(songId),
    );
    for (const seat of desiredEmpty) {
      statements.push(
        db
          .prepare(
            "INSERT INTO song_members (song_id, member_id, row_index, position, color) VALUES (?, NULL, ?, ?, NULL)",
          )
          .bind(songId, seat.row_index, seat.position),
      );
    }
  }

  if (statements.length > 0) await db.batch(statements);
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
  const entries = Object.entries(colors);
  const statements: D1PreparedStatement[] = entries.map(([memberId, color]) =>
    db
      .prepare("UPDATE song_members SET color = ? WHERE song_id = ? AND member_id = ?")
      .bind(color ?? null, songId, Number(memberId)),
  );

  // colors に含まれない（＝色を外された）座っているメンバーの色をクリアする。
  // クライアントは「色なし」のメンバーを colors から削除するため、明示的に消さないと残ってしまう。
  const coloredIds = entries.map(([memberId]) => Number(memberId));
  if (coloredIds.length === 0) {
    statements.push(
      db
        .prepare(
          "UPDATE song_members SET color = NULL WHERE song_id = ? AND member_id IS NOT NULL AND color IS NOT NULL",
        )
        .bind(songId),
    );
  } else {
    const placeholders = coloredIds.map(() => "?").join(",");
    statements.push(
      db
        .prepare(
          `UPDATE song_members SET color = NULL WHERE song_id = ? AND member_id IS NOT NULL AND color IS NOT NULL AND member_id NOT IN (${placeholders})`,
        )
        .bind(songId, ...coloredIds),
    );
  }

  if (statements.length > 0) await db.batch(statements);
}
