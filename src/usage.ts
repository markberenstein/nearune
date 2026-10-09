// Claude (Anthropic API) token usage, counted from each response's usage
// block and saved per month so it survives restarts. Haiku 4.5 pricing:
// $1 per million input tokens, $5 per million output tokens.
import { useS3, s3 } from "./storage";

type Bucket = { calls: number; input: number; output: number };
type Store = Record<string, Record<string, Bucket>>; // month -> purpose -> bucket
const KEY = "claude-usage.json";
const LOCAL = "./local-claude-usage.json";
let store: Store | null = null;
let loading: Promise<void> | null = null;
let lastWrite = 0;
let dirty = false;

async function load(): Promise<void> {
  if (store) return;
  if (!loading) loading = (async () => {
    try {
      let raw: string | null = null;
      if (useS3 && s3) { const f = s3.file(KEY); if (await f.exists()) raw = await f.text(); }
      else { try { raw = await Bun.file(LOCAL).text(); } catch {} }
      store = raw ? JSON.parse(raw) : {};
    } catch { store = {}; }
  })();
  await loading;
}

async function flush(): Promise<void> {
  if (!store || !dirty) return;
  dirty = false; lastWrite = Date.now();
  try {
    const text = JSON.stringify(store);
    if (useS3 && s3) await s3.file(KEY).write(text); else await Bun.write(LOCAL, text);
  } catch { dirty = true; }
}

// Call with the parsed JSON body of any Anthropic response.
export function recordClaude(purpose: string, data: any): void {
  const u = data && data.usage;
  if (!u) return;
  (async () => {
    await load();
    const month = new Date().toISOString().slice(0, 7);
    const m = (store![month] ||= {});
    const b = (m[purpose] ||= { calls: 0, input: 0, output: 0 });
    b.calls++;
    b.input += Number(u.input_tokens) || 0;
    b.output += Number(u.output_tokens) || 0;
    dirty = true;
    if (Date.now() - lastWrite > 5000) await flush();
  })().catch(() => {});
}

export async function claudeUsageSummary() {
  await load();
  await flush();
  const month = new Date().toISOString().slice(0, 7);
  const m = store![month] || {};
  let calls = 0, input = 0, output = 0;
  for (const b of Object.values(m)) { calls += b.calls; input += b.input; output += b.output; }
  const cost = input / 1e6 * 1 + output / 1e6 * 5;
  return { month, calls, input, output, costUsd: Math.round(cost * 10000) / 10000, byPurpose: m };
}
