import { defineConfig } from "drizzle-kit";
import { resolveDbPath } from "./src/db/path.ts";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: resolveDbPath(),
  },
});
