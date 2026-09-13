import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 開発時は `npm run cf:dev`（wrangler pages dev）経由でViteをプロキシするため、
// この設定にAPIプロキシは不要。静的ビルドのみを担当する。
export default defineConfig({
  plugins: [react()],
});
