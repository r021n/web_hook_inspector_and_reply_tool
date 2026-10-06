import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { PORT } from "./config.ts";

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
