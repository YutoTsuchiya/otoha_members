// POST /api/auth/login  共通パスワードでログインし、セッションクッキーを発行する
import { readJson } from "../../../shared/api-helpers.ts";
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPassword,
} from "../../../shared/auth.ts";

export const onRequestPost: ApiHandler = async (ctx) => {
  const body = await readJson(ctx.request);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!(await verifyPassword(ctx.env, password))) {
    return Response.json({ error: "パスワードが違います" }, { status: 401 });
  }

  const token = await createSessionToken(ctx.env);
  if (!token) {
    return Response.json({ error: "認証が設定されていません" }, { status: 500 });
  }

  return Response.json(
    { ok: true },
    {
      headers: {
        "Set-Cookie": `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`,
      },
    },
  );
};
