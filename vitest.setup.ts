import { vi } from "vitest";

// "server-only" throws on import outside Next's "react-server" resolve
// condition, which plain Node/vitest doesn't set — every lib/ai/tools/*
// module (and much of the rest of lib/) starts with `import "server-only"`.
// Stub it globally so tool modules can be imported directly in tests.
vi.mock("server-only", () => ({}));

// db/client.ts throws at import time when DATABASE_URL is unset, so every
// module that touches it — execute.ts, the query modules, the server actions —
// was impossible to import in a unit test at all. That is a large part of why
// the order path had no coverage.
//
// postgres.js connects lazily, so a placeholder is enough to make those
// modules importable. An actual query still fails loudly, which is the
// correct outcome: a unit test that reaches the database is a bug in the test.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
