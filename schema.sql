-- 座席表作成サイトのスキーマ（冪等・再実行可能）
-- 適用: npm run db:local / npm run db:remote

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  -- 閲覧用URLの共有トークン。未設定（NULL）なら共有なし。
  share_token TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
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
  -- 演奏内での表示順。並び替えで振り直す（0 始まり）。
  position   INTEGER NOT NULL DEFAULT 0,
  -- 色分けのパート一覧（[{color, name}, ...] の JSON 配列）。
  group_names TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 曲ごとの出演者と席。
-- 行の人数は固定ではないので、row_index（何行目か）と position（その行の何番目か）を
-- それぞれ持つ。こうすることで、誰かを別の行へ動かしても他の人の配置は変わらない。
CREATE TABLE IF NOT EXISTS song_members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id   INTEGER NOT NULL REFERENCES songs(id)   ON DELETE CASCADE,
  -- NULL は空席を表す（通常の席はメンバーID）。
  member_id INTEGER REFERENCES members(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  position  INTEGER NOT NULL,
  -- 色分け（red/blue/yellow、未割当は NULL）
  color     TEXT,
  UNIQUE (song_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_members_event      ON members(event_id);
CREATE INDEX IF NOT EXISTS idx_songs_event        ON songs(event_id);
CREATE INDEX IF NOT EXISTS idx_song_members_song  ON song_members(song_id, row_index, position);
