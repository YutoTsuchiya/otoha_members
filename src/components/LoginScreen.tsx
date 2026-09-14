import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../api";

interface Props {
  onLogin: () => void;
}

/** 共通パスワードでログインする画面 */
export default function LoginScreen({ onLogin }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { method: "POST", body: { password } });
      onLogin();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h2 className="login-title">ログイン</h2>
        <p className="muted">共有のパスワードを入力してください。</p>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワード"
          autoFocus
          autoComplete="off"
        />
        {error && <p className="error-text">{error}</p>}
        <button type="submit" className="button-primary" disabled={busy || !password}>
          ログイン
        </button>
      </form>
    </div>
  );
}
