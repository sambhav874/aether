import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Supabase projects ship extra schemas/extensions (auth, storage,
  // realtime, vault, ...) whose objects have tripped up drizzle-kit's
  // introspection during `db:push` — scope it to our own schema.
  schemaFilter: ["public"],
  casing: "snake_case",
});
