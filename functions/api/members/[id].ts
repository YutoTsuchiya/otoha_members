// PATCH  /api/members/:id  参加者の名前を変更
// DELETE /api/members/:id  参加者を削除（各曲の席からも外れるが、他の人の席順は変えない）
import { idParam, json, jsonError, readName, type MemberRow } from "../../../shared/api-helpers.ts";

export const onRequestPatch: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("参加者IDが不正です", 400);

  const name = await readName(ctx.request);
  if (!name) return jsonError("参加者の名前を入力してください", 400);

  const db = ctx.env.DB;
  const exists = await db.prepare("SELECT id FROM members WHERE id = ?").bind(id).first();
  if (!exists) return jsonError("参加者が見つかりません", 404);

  await db.prepare("UPDATE members SET name = ? WHERE id = ?").bind(name, id).run();
  const row = await db
    .prepare("SELECT id, event_id, name, created_at FROM members WHERE id = ?")
    .bind(id)
    .first<MemberRow>();

  return json(row);
};

export const onRequestDelete: PagesFunction<Env> = async (ctx) => {
  const id = idParam(ctx.params);
  if (id === null) return jsonError("参加者IDが不正です", 400);

  const db = ctx.env.DB;
  const exists = await db.prepare("SELECT id FROM members WHERE id = ?").bind(id).first();
  if (!exists) return jsonError("参加者が見つかりません", 404);

  // この人の席だけを外す。他の人の行・順番はそのまま残す。
  await db.batch([
    db.prepare("DELETE FROM song_members WHERE member_id = ?").bind(id),
    db.prepare("DELETE FROM members WHERE id = ?").bind(id),
  ]);

  return new Response(null, { status: 204 });
};
