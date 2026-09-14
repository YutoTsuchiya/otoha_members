-- 空席対応: song_members.member_id を NULL 許容にする（NULL=空席）。
-- 既存データを保ったままテーブルを作り直す。
-- 適用: wrangler d1 execute otoha-members --remote --file=./migrations/0001_empty_seats.sql
--       （ローカルは --remote の代わりに --local）

PRAGMA foreign_keys = OFF;

CREATE TABLE song_members_new (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   INTEGER NOT NULL REFERENCES songs(id)   ON DELETE CASCADE,
  member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  color     TEXT,
  UNIQUE (song_id, member_id)
);

INSERT INTO song_members_new (id, song_id, member_id, row_index, position, color)
  SELECT id, song_id, member_id, row_index, position, color FROM song_members;

DROP TABLE song_members;

ALTER TABLE song_members_new RENAME TO song_members;

CREATE INDEX IF NOT EXISTS idx_song_members_song ON song_members(song_id, row_index, position);

PRAGMA foreign_keys = ON;
