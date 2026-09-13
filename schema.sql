-- 座席表作成サイトのスキーマ（冪等・再実行可能）
-- 適用: npm run db:local / npm run db:remote

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS songs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id   INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 曲ごとの出演者と席。
-- 行の人数は固定ではないので、row_index（何行目か）と position（その行の何番目か）を
-- それぞれ持つ。こうすることで、誰かを別の行へ動かしても他の人の配置は変わらない。
CREATE TABLE IF NOT EXISTS song_members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   INTEGER NOT NULL REFERENCES songs(id)   ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  UNIQUE (song_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_members_event      ON members(event_id);
CREATE INDEX IF NOT EXISTS idx_songs_event        ON songs(event_id);
CREATE INDEX IF NOT EXISTS idx_song_members_song  ON song_members(song_id, row_index, position);
