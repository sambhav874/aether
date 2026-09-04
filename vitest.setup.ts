import { vi } from "vitest";

// "server-only" throws on import outside Next's "react-server" resolve
// condition, which plain Node/vitest doesn't set — every lib/ai/tools/*
// module (and much of the rest of lib/) starts with `import "server-only"`.
// Stub it globally so tool modules can be imported directly in tests.
vi.mock("server-only", () => ({}));
