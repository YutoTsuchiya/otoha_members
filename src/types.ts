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

export interface Song {
  id: number;
  event_id: number;
  name: string;
  created_at: string;
  /** 席の配置。行ごとの参加者IDで、行の人数は固定ではない。 */
  rows: number[][];
}

export type View =
  | { name: "list" }
  | { name: "event"; eventId: number; eventName: string }
  | { name: "members"; eventId: number; eventName: string }
  | { name: "seating"; eventId: number; eventName: string; songId: number; songName: string };
