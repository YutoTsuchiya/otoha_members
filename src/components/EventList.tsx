import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { useAsyncAction } from "../useAsyncAction";
import type { EventItem, EventSummary } from "../types";

interface Props {
  onOpen: (eventId: number, eventName: string) => void;
}

export default function EventList({ onOpen }: Props) {
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const { error, setError, busy, run } = useAsyncAction();

  const load = useCallback(async () => {
    try {
      setEvents(await api<EventSummary[]>("/api/events"));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void load();
  }, [load]);

  // 入力画面は Esc で閉じる
  useEffect(() => {
    if (!dialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialogOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen]);

  const createEvent = () =>
    run(async () => {
      const name = newName.trim();
      if (!name) return;
      await api<EventItem>("/api/events", { method: "POST", body: { name } });
      setNewName("");
      setDialogOpen(false);
      await load();
    });

  const copyEvent = (eventId: number) =>
    run(async () => {
      await api<EventItem>(`/api/events/${eventId}/copy`, { method: "POST" });
      setDialogOpen(false);
      await load();
    });

  return (
    <div className="page page-fab">
      <h2 className="page-title">演奏一覧</h2>

      {error && <p className="error-text">{error}</p>}

      {loading ? (
        <p className="muted">読み込み中…</p>
      ) : events.length === 0 ? (
        <p className="muted">演奏がまだありません。右下の ＋ から追加してください。</p>
      ) : (
        <ul className="list event-list">
          {events.map((event) => (
            <li key={event.id} className="list-item">
              <button
                type="button"
                className="item-main event-row"
                onClick={() => onOpen(event.id, event.name)}
              >
                <span className="item-name">{event.name}</span>
                <span className="row-meta">
                  <span className="event-count">
                    {event.song_count}曲・{event.member_count}人
                  </span>
                  <span className="row-arrow" aria-hidden="true">→</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="fab"
        aria-label="新しい演奏を追加"
        onClick={() => {
          setNewName("");
          setDialogOpen(true);
        }}
      >
        ＋
      </button>

      {dialogOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDialogOpen(false);
          }}
        >
          <form
            className="modal modal-wide"
            onSubmit={(e) => {
              e.preventDefault();
              void createEvent();
            }}
          >
            <h2>新しい演奏</h2>
            <p className="modal-hint">演奏名を入力してください（例: 第50回定期演奏会）。</p>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="第50回定期演奏会"
            />
            <div className="modal-actions">
              <button type="button" className="button-sub" onClick={() => setDialogOpen(false)}>
                キャンセル
              </button>
              <button type="submit" className="button-primary" disabled={busy || !newName.trim()}>
                作成
              </button>
            </div>

            {events.length > 0 && (
              <div className="copy-section">
                <p className="modal-hint">既存の演奏をコピー</p>
                <ul className="list compact song-list">
                  {events.map((event) => (
                    <li key={event.id} className="list-item">
                      <button
                        type="button"
                        className="item-main song-row"
                        disabled={busy}
                        onClick={() => copyEvent(event.id)}
                      >
                        <span className="item-name">{event.name}</span>
                        <span className="event-count">
                          {event.song_count}曲・{event.member_count}人
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        </div>
      )}
    </div>
  );
}
