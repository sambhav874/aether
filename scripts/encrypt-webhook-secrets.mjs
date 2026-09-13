// One-time migration: encrypt webhook secrets that are still stored plaintext.
//
// Cannot be a SQL migration — the key lives in BROKER_CREDENTIALS_ENCRYPTION_KEY
// and only the app can apply it. Idempotent: rows already encrypted are
// skipped, so re-running is harmless and a partial run simply resumes.
//
//   node scripts/encrypt-webhook-secrets.mjs
import { config } from "dotenv";
import postgres from "postgres";
import { createCipheriv, randomBytes, scryptSync } from "node:crypto";

config({ path: ".env.local" });

const secretKey = process.env.BROKER_CREDENTIALS_ENCRYPTION_KEY;
if (!process.env.DATABASE_URL || !secretKey) {
  console.error("DATABASE_URL and BROKER_CREDENTIALS_ENCRYPTION_KEY must both be set.");
  process.exit(1);
}

// Must match lib/crypto.ts exactly, including the scrypt salt.
const key = scryptSync(secretKey, "monarch-broker-credentials", 32);
function encrypt(plain) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify({ v: plain }), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(":");
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false });

try {
  const rows = await sql`select id, slug, webhook_secret from strategies`;
  let encrypted = 0;
  let skipped = 0;

  for (const row of rows) {
    // Ciphertext is three base64 parts joined by ":"; a raw secret is hex.
    if (String(row.webhook_secret).split(":").length === 3) {
      skipped += 1;
      continue;
    }
    await sql`update strategies set webhook_secret = ${encrypt(row.webhook_secret)} where id = ${row.id}`;
    console.log(`  encrypted ${row.slug}`);
    encrypted += 1;
  }

  console.log(`\nDone — ${encrypted} encrypted, ${skipped} already encrypted.`);
  console.log("Secrets are unchanged; alerts keep working. Reveal still shows the same value.");
} catch (error) {
  console.error("failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
