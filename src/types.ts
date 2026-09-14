export interface EventItem {
  id: number;
  name: string;
  created_at: string;
}

/** 一覧用（曲数・人数つき） */
export interface EventSummary extends EventItem {
  song_count: number;
  member_count: number;
}

export interface Member {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
}

/** 色分けの1パート（色キーと表示名）。 */
export interface Part {
  color: string;
  name: string;
}

export interface Song {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
  /** 席の配置。行ごとの参加者ID（正）または空席（null）。行の人数は固定ではない。 */
  rows: (number | null)[][];
  /** 色分けのパート一覧（例: 赤=Aパート）。並び順に表示。 */
  parts: Part[];
  /** メンバーIDごとの色キー。未割当のメンバーは含まれない。 */
  colors: Record<number, string>;
}

/** 閲覧用URL（共有リンク）が返すデータ。 */
export interface ShareData {
  event: { id: number; name: string };
  members: Member[];
  songs: Song[];
}

export type View =
  | { name: "list" }
  | { name: "event"; eventId: number; eventName: string }
  | { name: "members"; eventId: number; eventName: string }
  | { name: "seating"; eventId: number; eventName: string; songId: number; songName: string };
