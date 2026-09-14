import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api";
import { useAsyncAction } from "../useAsyncAction";
import type { Member } from "../types";

interface Props {
  eventId: number;
  eventName: string;
  onBack: () => void;
}

export default function MemberList({ eventId, eventName, onBack }: Props) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const { error, setError, busy, run } = useAsyncAction();

  const load = useCallback(async () => {
    try {
      setMembers(await api<Member[]>(`/api/events/${eventId}/members`));
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

  const addMember = () =>
    run(async () => {
      const name = newName.trim();
      if (!name) return;
      await api<Member>(`/api/events/${eventId}/members`, { method: "POST", body: { name } });
      setNewName("");
      await load();
    });

  const renameMember = (id: number) =>
    run(async () => {
      const name = editingName.trim();
      if (!name) return;
      await api<Member>(`/api/members/${id}`, { method: "PATCH", body: { name } });
      setEditingId(null);
      await load();
    });

  const deleteMember = (member: Member) => {
    if (!confirm(`「${member.name}」を削除しますか？\n各曲の座席表からも外れます。`)) return;
    void run(async () => {
      await api(`/api/members/${member.id}`, { method: "DELETE" });
      await load();
    });
  };

  return (
    <div className="page">
      <div className="page-head">
        <button type="button" className="button-sub" onClick={onBack}>
          ← {eventName}
        </button>
        <h2 className="page-title">参加者（{members.length}人）</h2>
      </div>
      <p className="muted page-subtitle">{eventName}</p>

      {error && <p className="error-text">{error}</p>}

      <section className="card">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            void addMember();
          }}
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="参加者の名前を1人ずつ入力"
          />
          <button type="submit" className="button-primary" disabled={busy || !newName.trim()}>
            追加
          </button>
        </form>

        {loading ? (
          <p className="muted">読み込み中…</p>
        ) : members.length === 0 ? (
          <p className="muted">まだ参加者がいません。上の欄から1人ずつ追加してください。</p>
        ) : (
          <ul className="list compact member-list">
            {members.map((member) => (
              <li key={member.id} className="list-item">
                {editingId === member.id ? (
                  <form
                    className="inline-form grow"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void renameMember(member.id);
                    }}
                  >
                    <input
                      value={editingName}
                      autoFocus
                      onChange={(e) => setEditingName(e.target.value)}
                    />
                    <button type="submit" className="button-primary" disabled={busy}>
                      保存
                    </button>
                    <button type="button" className="button-sub" onClick={() => setEditingId(null)}>
                      取消
                    </button>
                  </form>
                ) : (
                  <>
                    <span className="item-name grow">{member.name}</span>
                    <div className="item-actions">
                      <button
                        type="button"
                        className="button-sub"
                        onClick={() => {
                          setEditingId(member.id);
                          setEditingName(member.name);
                        }}
                      >
                        名前変更
                      </button>
                      <button type="button" className="button-danger" onClick={() => deleteMember(member)}>
                        削除
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
