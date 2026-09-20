# Same Sky

A private daily-question ritual app for two people, deployed on Railway (Bun).

- `/` — the original room (unchanged from before; this is Mark & Nikita's room).
- `/r/<roomId>` — any other room.
- `/new` — create a fresh private room.

## Storage

S3-compatible bucket when `S3_BUCKET`/`S3_ACCESS_KEY_ID` are set (see `src/storage.ts`), otherwise local files (dev only — not durable on Railway).

## Structure

- `src/types.ts` — shared types
- `src/storage.ts` — room-scoped state storage (S3/local)
- `src/translate.ts` — Google Translate + MyMemory fallback
- `src/util.ts` — small shared helpers
- `src/page.ts` — the client HTML/CSS/JS page template
- `src/server.ts` — Bun HTTP server / routes
