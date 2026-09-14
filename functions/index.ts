// Workers のエントリポイント。/api/* を各ハンドラーへ振り分け、それ以外は静的アセットを返す。
import { onRequestGet as eventsGet, onRequestPost as eventsPost } from "./api/events.ts";
import {
  onRequestGet as eventGet,
  onRequestPatch as eventPatch,
  onRequestDelete as eventDelete,
} from "./api/events/[id].ts";
import {
  onRequestGet as membersGet,
  onRequestPost as membersPost,
} from "./api/events/[id]/members.ts";
import {
  onRequestGet as songsGet,
  onRequestPost as songsPost,
  onRequestPut as songsPut,
} from "./api/events/[id]/songs.ts";
import {
  onRequestGet as shareGet,
  onRequestPost as sharePost,
  onRequestDelete as shareDelete,
} from "./api/events/[id]/share.ts";
import { onRequestPost as copyPost } from "./api/events/[id]/copy.ts";
import {
  onRequestPatch as memberPatch,
  onRequestDelete as memberDelete,
} from "./api/members/[id].ts";
import {
  onRequestGet as songGet,
  onRequestPatch as songPatch,
  onRequestDelete as songDelete,
} from "./api/songs/[id].ts";
import { onRequestPut as seatsPut } from "./api/songs/[id]/seats.ts";
import { onRequestPost as loginPost } from "./api/auth/login.ts";
import { onRequestPost as logoutPost } from "./api/auth/logout.ts";
import { onRequestGet as meGet } from "./api/auth/me.ts";
import { onRequestGet as shareTokenGet } from "./api/share/[token].ts";

function notFound(): Response {
  return Response.json({ error: "見つかりません" }, { status: 404 });
}

function call(
  handler: ApiHandler | undefined,
  request: Request,
  env: Env,
  params: Record<string, string>,
): Response | Promise<Response> {
  if (!handler) return notFound();
  return handler({ request, env, params });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith("/api/")) {
      // 静的アセット（dist/）と SPA の index.html を返す
      return env.ASSETS.fetch(request);
    }

    // "/api/" を除いたセグメント。例: ["events", "123", "songs"]
    const seg = path.slice("/api/".length).split("/").filter(Boolean);

    switch (seg[0]) {
      case "events": {
        if (seg.length === 1) {
          if (method === "GET") return call(eventsGet, request, env, {});
          if (method === "POST") return call(eventsPost, request, env, {});
        } else if (seg.length === 2) {
          const params = { id: seg[1] };
          if (method === "GET") return call(eventGet, request, env, params);
          if (method === "PATCH") return call(eventPatch, request, env, params);
          if (method === "DELETE") return call(eventDelete, request, env, params);
        } else if (seg.length === 3) {
          const params = { id: seg[1] };
          if (seg[2] === "members") {
            if (method === "GET") return call(membersGet, request, env, params);
            if (method === "POST") return call(membersPost, request, env, params);
          }
          if (seg[2] === "songs") {
            if (method === "GET") return call(songsGet, request, env, params);
            if (method === "POST") return call(songsPost, request, env, params);
            if (method === "PUT") return call(songsPut, request, env, params);
          }
          if (seg[2] === "share") {
            if (method === "GET") return call(shareGet, request, env, params);
            if (method === "POST") return call(sharePost, request, env, params);
            if (method === "DELETE") return call(shareDelete, request, env, params);
          }
          if (seg[2] === "copy" && method === "POST") {
            return call(copyPost, request, env, params);
          }
        }
        return notFound();
      }
      case "members": {
        if (seg.length === 2) {
          const params = { id: seg[1] };
          if (method === "PATCH") return call(memberPatch, request, env, params);
          if (method === "DELETE") return call(memberDelete, request, env, params);
        }
        return notFound();
      }
      case "songs": {
        if (seg.length === 2) {
          const params = { id: seg[1] };
          if (method === "GET") return call(songGet, request, env, params);
          if (method === "PATCH") return call(songPatch, request, env, params);
          if (method === "DELETE") return call(songDelete, request, env, params);
        }
        if (seg.length === 3 && seg[2] === "seats" && method === "PUT") {
          return call(seatsPut, request, env, { id: seg[1] });
        }
        return notFound();
      }
      case "auth": {
        if (seg.length === 2) {
          if (seg[1] === "login" && method === "POST") return call(loginPost, request, env, {});
          if (seg[1] === "logout" && method === "POST") return call(logoutPost, request, env, {});
          if (seg[1] === "me" && method === "GET") return call(meGet, request, env, {});
        }
        return notFound();
      }
      case "share": {
        if (seg.length === 2 && method === "GET") {
          return call(shareTokenGet, request, env, { token: seg[1] });
        }
        return notFound();
      }
      default:
        return notFound();
    }
  },
};
