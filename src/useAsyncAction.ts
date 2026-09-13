import { useCallback, useState } from "react";
import { errorMessage } from "./api";

/**
 * エラー表示と二重実行の防止つきで非同期処理を実行する。
 * 各画面で同じ try/catch を書かなくて済むようにするための共通処理。
 */
export function useAsyncAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return { error, setError, busy, run };
}
