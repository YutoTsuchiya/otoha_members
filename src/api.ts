type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
}

/**
 * /api/* を呼ぶ。
 * 失敗したときは、サーバーが返したエラーメッセージをそのまま Error にして投げる。
 */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      typeof data === "object" &&
      data !== null &&
      typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `通信に失敗しました (${res.status})`;
    throw new Error(message);
  }

  return data as T;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "エラーが発生しました";
}
