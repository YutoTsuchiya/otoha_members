// 共通パスワード認証のためのヘルパー。
// ログインに成功すると HMAC-SHA256 で署名したセッションクッキーを発行し、
// 以後は各エンドポイントが requireAuth でそれを検証する。
//
// シークレットは2つ:
//   AUTH_PASSWORD … 全員が共有するパスワード
//   AUTH_SECRET   … セッション署名に使う鍵
// ローカルは .dev.vars、本番は `wrangler secret put` で設定する。

declare global {
  /** Workers の API ハンドラーの文脈。ルーターが URL をパースして params を渡す。 */
  interface ApiContext {
    request: Request;
    env: Env;
    params: Record<string, string>;
  }
  type ApiHandler = (ctx: ApiContext) => Response | Promise<Response>;
}

export const SESSION_COOKIE = "otoha_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日
export const SESSION_TTL_SECONDS = Math.floor(SESSION_TTL_MS / 1000);

/** バイト列を16進文字列にする */
function hex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256 で署名する */
async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return hex(new Uint8Array(signature));
}

/** 文字列を定数時間で比較する（タイミング攻撃を避ける） */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/** パスワードが正しいか。AUTH_PASSWORD 未設定なら常に false（誤って開かない）。 */
export async function verifyPassword(env: Env, password: string): Promise<boolean> {
  const expected = env.AUTH_PASSWORD;
  if (!expected) return false;
  return timingSafeEqual(password, expected);
}

/** セッショントークンを作る。値は「期限ms.署名」。AUTH_SECRET 未設定なら null。 */
export async function createSessionToken(env: Env): Promise<string | null> {
  const secret = env.AUTH_SECRET;
  if (!secret) return null;
  const expiry = Date.now() + SESSION_TTL_MS;
  const signature = await sign(secret, String(expiry));
  return `${expiry}.${signature}`;
}

/** セッショントークンが正しいか（署名と有効期限を確かめる） */
async function verifySessionToken(secret: string, token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const expiry = Number(token.slice(0, dot));
  const signature = token.slice(dot + 1);
  if (!Number.isFinite(expiry) || Date.now() >= expiry) return false;
  const expected = await sign(secret, String(expiry));
  return timingSafeEqual(signature, expected);
}

/** リクエストのクッキーから値を取り出す */
export function getCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/** 認証されていれば null、されていなければ 401 の Response を返す。 */
export async function requireAuth(ctx: { request: Request; env: Env }): Promise<Response | null> {
  const secret = ctx.env.AUTH_SECRET;
  if (!secret) {
    return Response.json({ error: "認証が設定されていません" }, { status: 401 });
  }
  const token = getCookie(ctx.request, SESSION_COOKIE);
  if (!token || !(await verifySessionToken(secret, token))) {
    return Response.json({ error: "認証が必要です" }, { status: 401 });
  }
  return null;
}
