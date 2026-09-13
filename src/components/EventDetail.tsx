import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { defaultLayout } from "../layout";
import { useAsyncAction } from "../useAsyncAction";
import type { EventItem, Member, Song } from "../types";
import MemberSelector from "./MemberSelector";

interface Props {
  eventId: number;
  eventName: string;
  onBack: () => void;
  onOpenSong: (songId: number, songName: string) => void;
  /** 参加者一覧へ移動 */
  onOpenMembers: () => void;
  /** イベント名を変えたとき（画面の表示を追従させる） */
  onRenamed: (name: string) => void;
  /** イベントを削除したとき */
  onDeleted: () => void;
}

export default function EventDetail({
  eventId,
  eventName,
  onBack,
  onOpenSong,
  onOpenMembers,
  onRenamed,
  onDeleted,
}: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingEventName, setEditingEventName] = useState(false);
  const [eventNameInput, setEventNameInput] = useState(eventName);

  const [newSongName, setNewSongName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [songDialogOpen, setSongDialogOpen] = useState(false);

  const { error, setError, busy, run } = useAsyncAction();

  const load = useCallback(async () => {
    try {
      const [memberList, songList] = await Promise.all([
        api<Member[]>(`/api/events/${eventId}/members`),
        api<Song[]>(`/api/events/${eventId}/songs`),
      ]);
      setMembers(memberList);
      setSongs(songList);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [eventId, setError]);

  useEffect(() => {
    void load();
  }, [load]);

  // 曲を追加する画面は Esc で閉じる
  useEffect(() => {
    if (!songDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSongDialogOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [songDialogOpen]);

  const renameEvent = () =>
    run(async () => {
      const name = eventNameInput.trim();
      if (!name) return;
      const updated = await api<EventItem>(`/api/events/${eventId}`, {
        method: "PATCH",
        body: { name },
      });
      setEditingEventName(false);
      onRenamed(updated.name);
    });

  const deleteEvent = () => {
    if (!confirm(`「${eventName}」を削除しますか？\n参加者・曲・座席表もすべて削除されます。`)) return;
    void run(async () => {
      await api(`/api/events/${eventId}`, { method: "DELETE" });
      onDeleted();
    });
  };

  const toggleMember = (memberId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const createSong = () =>
    run(async () => {
      const name = newSongName.trim();
      if (!name) return;
      // チェックした順ではなく、参加者一覧の並び順で席を作る
      const memberIds = members.filter((m) => selectedIds.has(m.id)).map((m) => m.id);
      await api<Song>(`/api/events/${eventId}/songs`, {
        method: "POST",
        // 既定の行数に均等に振り分けた状態から始める
        body: { name, rows: defaultLayout(memberIds) },
      });
      setNewSongName("");
      setSelectedIds(new Set());
      setSongDialogOpen(false);
      await load();
    });

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="button-sub" onClick={onBack}>
          ← イベント一覧
        </button>

        {editingEventName ? (
          <form
            className="inline-form grow"
            onSubmit={(e) => {
              e.preventDefault();
              void renameEvent();
            }}
          >
            <input
              value={eventNameInput}
              autoFocus
              onChange={(e) => setEventNameInput(e.target.value)}
            />
            <button type="submit" className="button-primary" disabled={busy}>
              保存
            </button>
            <button
              type="button"
              className="button-sub"
              onClick={() => {
                setEventNameInput(eventName);
                setEditingEventName(false);
              }}
            >
              取消
            </button>
          </form>
        ) : (
          <>
            <h2 className="page-title">{eventName}</h2>
            <div className="item-actions head-actions">
              <button
                type="button"
                className="button-sub"
                onClick={() => {
                  setEventNameInput(eventName);
                  setEditingEventName(true);
                }}
              >
                名前変更
              </button>
              <button type="button" className="button-danger" onClick={deleteEvent}>
                削除
              </button>
            </div>
          </>
        )}
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      <button type="button" className="nav-cell" onClick={onOpenMembers}>
        <span className="nav-cell-label">参加者一覧</span>
        <span className="nav-cell-meta">{members.length}人</span>
        <span className="nav-cell-arrow">→</span>
      </button>

      <section className="card">
        <div className="card-title-row">
          <h3 className="card-title">曲（{songs.length}曲）</h3>

          <button
            type="button"
            className="button-primary"
            disabled={members.length === 0}
            onClick={() => {
              setNewSongName("");
              setSelectedIds(new Set());
              setSongDialogOpen(true);
            }}
          >
            曲を追加
          </button>
        </div>

        {members.length === 0 && (
          <p className="muted">
            曲を追加するには、先に
            <button type="button" className="link-button" onClick={onOpenMembers}>
              参加者を登録
            </button>
            してください。
          </p>
        )}

        {songs.length === 0 ? (
          // メンバー0人のときは上の案内と重なるので出さない
          members.length > 0 && <p className="muted">まだ曲がありません。</p>
        ) : (
          <ul className="list compact song-list">
            {songs.map((song) => (
              <li key={song.id} className="list-item">
                <button
                  type="button"
                  className="item-main song-row"
                  onClick={() => onOpenSong(song.id, song.name)}
                >
                  <span className="item-name">{song.name}</span>
                  <span className="event-count">{song.rows.flat().length}人</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {songDialogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSongDialogOpen(false);
          }}
        >
          <form
            className="modal modal-wide"
            onSubmit={(e) => {
              e.preventDefault();
              void createSong();
            }}
          >
            <h2>曲を追加</h2>
            <input
              autoFocus
              value={newSongName}
              onChange={(e) => setNewSongName(e.target.value)}
              placeholder="曲名（例: 曲A）"
            />

            <div className="member-picker">
              <div className="member-picker-head">
                <span className="muted">この曲を弾く人を選択（{selectedIds.size}人）</span>
                <div className="item-actions">
                  <button
                    type="button"
                    className="button-sub"
                    onClick={() => setSelectedIds(new Set(members.map((m) => m.id)))}
                  >
                    全選択
                  </button>
                  <button
                    type="button"
                    className="button-sub"
                    onClick={() => setSelectedIds(new Set())}
                  >
                    全解除
                  </button>
                </div>
              </div>
              <MemberSelector members={members} selectedIds={selectedIds} onToggle={toggleMember} />
            </div>

            <div className="modal-actions">
              <button type="button" className="button-sub" onClick={() => setSongDialogOpen(false)}>
                キャンセル
              </button>
              <button
                type="submit"
                className="button-primary"
                disabled={busy || !newSongName.trim()}
              >
                追加
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
