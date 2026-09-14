import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "../api";
import { memberCount } from "../layout";
import type { ShareData } from "../types";
import SeatChartView from "./SeatChartView";

interface Props {
  token: string;
}

type ShareView = { name: "event" } | { name: "seating"; songId: number; songName: string };

/** 閲覧用URL（読み取り専用）。曲一覧から曲を選んで座席表を表示する。 */
export default function ShareViewer({ token }: Props) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ShareView>({ name: "event" });

  useEffect(() => {
    void api<ShareData>(`/api/share/${token}`)
      .then((d) => setData(d))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [token]);

  const song = useMemo(
    () => (view.name === "seating" ? data?.songs.find((s) => s.id === view.songId) ?? null : null),
    [data, view],
  );

  return (
    <div className="page">
      {error && <p className="error-text">{error}</p>}
      {loading && <p className="muted">読み込み中…</p>}

      {data && view.name === "event" && (
        <>
          <div className="page-head">
            <div className="page-title-row">
              <h2 className="page-title">{data.event.name}</h2>
            </div>
          </div>

          {data.songs.length === 0 ? (
            <p className="muted">まだ曲がありません。</p>
          ) : (
            <ul className="list compact song-list">
              {data.songs.map((s) => (
                <li key={s.id} className="list-item">
                  <button
                    type="button"
                    className="item-main song-row"
                    onClick={() => setView({ name: "seating", songId: s.id, songName: s.name })}
                  >
                    <span className="item-name">{s.name}</span>
                    <span className="row-meta">
                      <span className="event-count">{memberCount(s.rows)}人</span>
                      <span className="row-arrow" aria-hidden="true">→</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {data && view.name === "seating" && song && (
        <>
          <div className="page-head">
            <button type="button" className="button-sub" onClick={() => setView({ name: "event" })}>
              ← 曲一覧
            </button>
            <div className="page-title-row">
              <h2 className="page-title">{song.name}</h2>
            </div>
          </div>

          <SeatChartView
            layout={song.rows}
            members={data.members}
            colors={song.colors}
            parts={song.parts}
          />
        </>
      )}
    </div>
  );
}
