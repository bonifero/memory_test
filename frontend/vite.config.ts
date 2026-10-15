import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev the backend runs on :3000; in Docker the same paths are proxied by nginx (see nginx.conf).
const backend = process.env.BACKEND_URL ?? "http://localhost:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": backend,
      "/admin/api": { target: backend, rewrite: (path) => path.replace(/^\/admin\/api/, "/api/admin") }
    }
  }
});
