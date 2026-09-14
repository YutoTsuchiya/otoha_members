// GET    /api/events/:id/share  閲覧用URLの現在のトークンを返す（未発行なら null）
// POST   /api/events/:id/share  閲覧用URLのトークンを発行/再発行
// DELETE /api/events/:id/share  閲覧用URLを無効化
import { idParam, json, jsonError, randomToken } from "../../../../shared/api-helpers.ts";
import { requireAuth } from "../../../../shared/auth.ts";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("演奏IDが不正です", 400);

  const row = await ctx.env.DB
    .prepare("SELECT share_token FROM events WHERE id = ?")
    .bind(eventId)
    .first<{ share_token: string | null }>();
  if (!row) return jsonError("演奏が見つかりません", 404);

  return json({ token: row.share_token ?? null });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("演奏IDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("演奏が見つかりません", 404);

  const token = randomToken();
  await db.prepare("UPDATE events SET share_token = ? WHERE id = ?").bind(token, eventId).run();

  return json({ token });
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const denied = await requireAuth(ctx);
  if (denied) return denied;

  const eventId = idParam(ctx.params);
  if (eventId === null) return jsonError("演奏IDが不正です", 400);

  const db = ctx.env.DB;
  const event = await db.prepare("SELECT id FROM events WHERE id = ?").bind(eventId).first();
  if (!event) return jsonError("演奏が見つかりません", 404);

  await db.prepare("UPDATE events SET share_token = NULL WHERE id = ?").bind(eventId).run();

  return json({ ok: true });
};
