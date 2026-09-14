import { useEffect, useState } from "react";
import { api, setOnUnauthorized } from "./api";
import EventList from "./components/EventList";
import EventDetail from "./components/EventDetail";
import MemberList from "./components/MemberList";
import SeatingEditor from "./components/SeatingEditor";
import LoginScreen from "./components/LoginScreen";
import ShareViewer from "./components/ShareViewer";
import type { View } from "./types";

type AuthState = "loading" | "authenticated" | "unauthenticated";

// 起動時に ?share= トークンがあれば、読み取り専用の共有画面として表示する
const shareToken = new URLSearchParams(window.location.search).get("share");

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });
  const [auth, setAuth] = useState<AuthState>("loading");

  // 起動時に認証状態を確認し、以後 401 が返ったらログイン画面へ戻す
  // （共有リンクの場合は認証不要）
  useEffect(() => {
    if (shareToken) return;
    setOnUnauthorized(() => setAuth("unauthenticated"));
    void api("/api/auth/me")
      .then(() => setAuth("authenticated"))
      .catch(() => setAuth("unauthenticated"));
  }, []);

  const logout = () => {
    void api("/api/auth/logout", { method: "POST" }).then(() => {
      setView({ name: "list" });
      setAuth("unauthenticated");
    });
  };

  // 共有リンク（読み取り専用・認証不要）
  if (shareToken) {
    return (
      <div className="app">
        <header className="app-header">
          <span className="app-title">座席表閲覧</span>
        </header>
        <main className="app-main">
          <ShareViewer token={shareToken} />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="app-title" onClick={() => setView({ name: "list" })}>
          座席表作成
        </button>
        {auth === "authenticated" && (
          <button type="button" className="button-sub" onClick={logout}>
            ログアウト
          </button>
        )}
      </header>

      <main className="app-main">
        {auth === "loading" && <p className="muted">読み込み中…</p>}

        {auth === "unauthenticated" && (
          <LoginScreen onLogin={() => setAuth("authenticated")} />
        )}

        {auth === "authenticated" && (
          <>
            {view.name === "list" && (
              <EventList
                onOpen={(eventId, eventName) => setView({ name: "event", eventId, eventName })}
              />
            )}

            {view.name === "event" && (
              <EventDetail
                eventId={view.eventId}
                eventName={view.eventName}
                onBack={() => setView({ name: "list" })}
                onRenamed={(eventName) => setView({ ...view, eventName })}
                onDeleted={() => setView({ name: "list" })}
                onOpenMembers={() =>
                  setView({ name: "members", eventId: view.eventId, eventName: view.eventName })
                }
                onOpenSong={(songId, songName) =>
                  setView({
                    name: "seating",
                    eventId: view.eventId,
                    eventName: view.eventName,
                    songId,
                    songName,
                  })
                }
              />
            )}

            {view.name === "members" && (
              <MemberList
                eventId={view.eventId}
                eventName={view.eventName}
                onBack={() =>
                  setView({ name: "event", eventId: view.eventId, eventName: view.eventName })
                }
              />
            )}

            {view.name === "seating" && (
              <SeatingEditor
                eventId={view.eventId}
                eventName={view.eventName}
                songId={view.songId}
                songName={view.songName}
                onBack={() =>
                  setView({ name: "event", eventId: view.eventId, eventName: view.eventName })
                }
                onRenamed={(songName) => setView({ ...view, songName })}
                onDeleted={() =>
                  setView({ name: "event", eventId: view.eventId, eventName: view.eventName })
                }
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
