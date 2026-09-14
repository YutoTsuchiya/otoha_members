// POST /api/auth/logout  ログアウト（セッションクッキーを削除する）
import { SESSION_COOKIE } from "../../../shared/auth.ts";

export const onRequestPost: PagesFunction<Env> = async () => {
  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      },
    },
  );
};
