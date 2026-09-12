import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
  var __aetherDbClient: ReturnType<typeof postgres> | undefined;
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set — copy .env.local.example to .env.local and fill it in.");
}

// `prepare: false` is required by Supabase's transaction pooler. `max` is
// the part that was missing: without it postgres.js opens up to 10
// connections per instance, and a serverless deployment scales instances
// independently of any pool size we think we have.
//
// One connection per serverless invocation is the right shape — the pooler
// upstream is what does the actual pooling. A long-running worker should
// raise this, which is why it reads from the environment.
const client =
  globalThis.__aetherDbClient ??
  postgres(connectionString, {
    prepare: false,
    max: Number(process.env.DATABASE_POOL_MAX ?? 1),
    idle_timeout: 20,
  });

// Without this, every hot reload in development leaks another pool until the
// database refuses new connections.
if (process.env.NODE_ENV !== "production") {
  globalThis.__aetherDbClient = client;
}

export const db = drizzle(client, { schema });
