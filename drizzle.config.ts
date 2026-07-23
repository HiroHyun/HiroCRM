import { defineConfig } from "drizzle-kit";
import { DB_PATH } from "./src/db/db-path";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: DB_PATH,
  },
  strict: true,
  verbose: true,
});
