// GET /api/auth/me  認証状態を返す（認証済みなら 200、未認証なら 401）
import { requireAuth } from "../../../shared/auth.ts";

export const onRequestGet: ApiHandler = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;
  return Response.json({ ok: true });
};
