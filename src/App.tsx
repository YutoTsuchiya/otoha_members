import { useState } from "react";
import EventList from "./components/EventList";
import EventDetail from "./components/EventDetail";
import MemberList from "./components/MemberList";
import SeatingEditor from "./components/SeatingEditor";
import type { View } from "./types";

export default function App() {
  const [view, setView] = useState<View>({ name: "list" });

  return (
    <div className="app">
      <header className="app-header">
        <button type="button" className="app-title" onClick={() => setView({ name: "list" })}>
          座席表作成
        </button>
      </header>

      <main className="app-main">
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
            onBack={() => setView({ name: "event", eventId: view.eventId, eventName: view.eventName })}
          />
        )}

        {view.name === "seating" && (
          <SeatingEditor
            eventId={view.eventId}
            songId={view.songId}
            songName={view.songName}
            onBack={() => setView({ name: "event", eventId: view.eventId, eventName: view.eventName })}
            onRenamed={(songName) => setView({ ...view, songName })}
            onDeleted={() =>
              setView({ name: "event", eventId: view.eventId, eventName: view.eventName })
            }
          />
        )}
      </main>
    </div>
  );
}
