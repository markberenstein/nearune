// Nearune — voice cloning & text-to-speech ("vocalizer"). ElevenLabs is the
// only provider wired up today, but every caller (server.ts) only ever goes
// through cloneVoice() / synthesizeSpeech() / deleteVoice() below — the same
// shape as util.ts's sendEmail() wrapping sendViaResend()/sendViaSendGrid()
// — so swapping to a different voice provider later (Play.ht, Resemble.ai,
// Azure, etc.) means rewriting the insides of these three functions, not
// anything that calls them.

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

// Checks an uploaded voice sample (a data URL from the app) and pulls out
// its type and bytes. Shared by /api/voice-sample and the morning QA check,
// so QA tests the exact code that saves real recordings, without calling
// ElevenLabs. Browsers report recordings with codec details, like
// "data:audio/webm;codecs=opus;base64,...": those are allowed, and only the
// container type is kept.
export type VoiceSampleParse = { ok: true; mimeType: string; bytes: Uint8Array; ext: string } | { ok: false; error: string };
export function voiceFileExt(mimeType: string): string {
  return mimeType.includes("webm") ? "webm" : mimeType.includes("m4a") ? "m4a" : mimeType.includes("mpeg") || mimeType.includes("mp3") ? "mp3" : mimeType.includes("aac") ? "aac" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
}
export function parseVoiceSample(dataUrl: unknown): VoiceSampleParse {
  if (typeof dataUrl !== "string") return { ok: false, error: "invalid" };
  const match = dataUrl.match(/^data:([a-zA-Z0-9/.+-]*)(?:;[^;,]*)*;base64,([\s\S]+)$/);
  if (!match) return { ok: false, error: "invalid" };
  const mimeType = match[1] || "application/octet-stream";
  let bytes: Uint8Array;
  try { bytes = Buffer.from(match[2], "base64"); } catch { return { ok: false, error: "invalid" }; }
  // A clean ~20-60s sample is plenty for Instant Voice Cloning; 10MB only
  // guards against an oversized upload.
  if (bytes.length < 2000) return { ok: false, error: "too_short" };
  if (bytes.length > 10 * 1024 * 1024) return { ok: false, error: "too_large" };
  return { ok: true, mimeType, bytes, ext: voiceFileExt(mimeType) };
}

export type CloneResult = { ok: true; voiceId: string } | { ok: false; error: string };

// Clones a voice from a short sample recording. ElevenLabs' Instant Voice
// Cloning works from well under a minute of clean audio. `label` is only a
// name shown in the ElevenLabs dashboard (never surfaced to either person in
// the app) — using the room id + person slot keeps each clone identifiable
// there without ever storing a real name.
export async function cloneVoice(sampleBytes: Uint8Array, mimeType: string, label: string): Promise<CloneResult> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, error: "no_key" };
  try {
    const ext = voiceFileExt(mimeType);
    const form = new FormData();
    form.append("name", label);
    form.append("files", new Blob([sampleBytes], { type: mimeType }), "sample." + ext);
    const res = await fetch(ELEVENLABS_BASE + "/voices/add", {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) {
      let msg = "clone_failed";
      try {
        const d: any = await res.json();
        if (d && d.detail && d.detail.message) msg = d.detail.message;
        // Logged server-side (not sent to the client) so a failure like a
        // plan voice-slot limit or a rejected sample format shows up in
        // Railway's logs instead of just a bare 502 with no context.
        console.log("[voice] clone failed for " + label + " -> HTTP " + res.status + ": " + JSON.stringify(d));
      } catch {
        console.log("[voice] clone failed for " + label + " -> HTTP " + res.status + " (no JSON body)");
      }
      return { ok: false, error: msg };
    }
    const data: any = await res.json();
    if (!data || !data.voice_id) return { ok: false, error: "no_voice_id" };
    return { ok: true, voiceId: data.voice_id };
  } catch {
    return { ok: false, error: "network_error" };
  }
}

// Removes a previously cloned voice — called when someone re-records (the
// old clone is replaced, not kept around at ElevenLabs forever) or when a
// room is deleted. Best-effort: nothing downstream depends on this
// succeeding, so failures are swallowed rather than surfaced.
export async function deleteVoice(voiceId: string): Promise<void> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key || !voiceId) return;
  try {
    await fetch(ELEVENLABS_BASE + "/voices/" + encodeURIComponent(voiceId), {
      method: "DELETE",
      headers: { "xi-api-key": key },
    });
  } catch {}
}

// Synthesizes `text` spoken in the given cloned voice. Returns raw MP3 bytes
// (ElevenLabs' default output format) or null on any failure — the caller
// (the /api/speak handler) treats null the same as "no voice configured" so
// the client's existing browser-speechSynthesis fallback just takes over.
// The speech model. Eleven v4 by default; set ELEVENLABS_MODEL in Railway to
// switch (for example back to "eleven_multilingual_v2") without a code change.
// If the preferred model is refused or fails, one retry on the previous
// model keeps voices working rather than dropping to the browser voice.
const PRIMARY_MODEL = (Bun.env.ELEVENLABS_MODEL || "eleven_v4").trim();
const FALLBACK_MODEL = "eleven_multilingual_v2";

async function speakWithModel(text: string, voiceId: string, model: string, key: string): Promise<Response> {
  return fetch(ELEVENLABS_BASE + "/text-to-speech/" + encodeURIComponent(voiceId), {
    method: "POST",
    headers: { "xi-api-key": key, "content-type": "application/json" },
    // The cloned voice can speak any of the app's supported languages, not
    // just whatever language the sample was recorded in (this also voices
    // the OTHER person's translated text back in the listener's language).
    //
    // voice_settings: stability nudged up from the default so the voice
    // stays close to the sample (and doesn't pick up a faint accent), but
    // not so high that delivery goes monotone.
    body: JSON.stringify({
      text,
      model_id: model,
      voice_settings: { stability: 0.7, similarity_boost: 0.85 },
    }),
  });
}

export async function synthesizeSpeech(text: string, voiceId: string): Promise<Uint8Array | null> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key || !voiceId || !text.trim()) return null;
  try {
    let res = await speakWithModel(text, voiceId, PRIMARY_MODEL, key);
    if (!res.ok && PRIMARY_MODEL !== FALLBACK_MODEL && res.status !== 401 && res.status !== 429) {
      let why = "";
      try { why = (await res.text()).slice(0, 200); } catch {}
      console.log("[voice] " + PRIMARY_MODEL + " failed -> HTTP " + res.status + " " + why + "; retrying on " + FALLBACK_MODEL);
      res = await speakWithModel(text, voiceId, FALLBACK_MODEL, key);
    }
    if (!res.ok) {
      // Logged (not sent to the client) so a failing voice shows its real reason in Railway's logs.
      let body = "";
      try { body = (await res.text()).slice(0, 300); } catch {}
      console.log("[voice] speak failed -> HTTP " + res.status + " " + body);
      lastSynthError = "HTTP " + res.status + " " + body;
      return null;
    }
    const buf = await res.arrayBuffer();
    lastSynthError = "";
    return new Uint8Array(buf);
  } catch (e: any) {
    console.log("[voice] speak failed -> " + (e?.message || e));
    lastSynthError = String(e?.message || e);
    return null;
  }
}

let lastSynthError = "";
// Health check for the twice-daily QA: speaks one short word in a real cloned
// voice and reports exactly why it failed if it did. (A few characters, so it
// costs next to nothing.)
// Can the API key create voices? Asks ElevenLabs to delete a voice id that
// doesn't exist: a key without voice-write permission gets refused (401),
// a working key just gets "not found". Creates nothing, uses no voice slot.
export async function voiceWritePermissionTest(): Promise<{ ok: boolean; detail: string }> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, detail: "no ElevenLabs key set" };
  try {
    const res = await fetch(ELEVENLABS_BASE + "/voices/nearuneqaprobe0000000000", { method: "DELETE", headers: { "xi-api-key": key } });
    let d: any = null;
    try { d = await res.json(); } catch {}
    const msg = (d && d.detail && (d.detail.message || d.detail.status)) || "";
    if (res.status === 401 || res.status === 403) return { ok: false, detail: "key can't create voices: " + (msg || "HTTP " + res.status) };
    return { ok: true, detail: "key has voice-write permission (probe got HTTP " + res.status + ")" };
  } catch (e: any) {
    return { ok: false, detail: "couldn't reach ElevenLabs: " + String(e?.message || e).slice(0, 80) };
  }
}

// Stock ElevenLabs voices, used for anyone who hasn't recorded their own.
// The iPhone app can't play the phone's built-in speech voice (it runs but
// makes no sound there), so everything is spoken by the server and played
// as normal audio. Picks from the account's premade voices by gender;
// ELEVENLABS_DEFAULT_MALE / _FEMALE / _NEUTRAL in Railway override the pick.
let premadeCache: { at: number; voices: { id: string; name: string; gender: string }[] } | null = null;
async function premadeVoices(): Promise<{ id: string; name: string; gender: string }[]> {
  if (premadeCache && Date.now() - premadeCache.at < 6 * 3600 * 1000) return premadeCache.voices;
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(ELEVENLABS_BASE + "/voices", { headers: { "xi-api-key": key } });
    if (!res.ok) { console.log("[voice] list voices -> HTTP " + res.status); return premadeCache ? premadeCache.voices : []; }
    const d: any = await res.json();
    const voices = ((d && d.voices) || [])
      .filter((v: any) => v && v.voice_id && v.category === "premade")
      .map((v: any) => ({ id: String(v.voice_id), name: String(v.name || ""), gender: String((v.labels && v.labels.gender) || "").toLowerCase() }));
    premadeCache = { at: Date.now(), voices };
    return voices;
  } catch {
    return premadeCache ? premadeCache.voices : [];
  }
}
// Well-known premade voices, used only if the account's list can't be read.
const FALLBACK_VOICES: Record<string, string> = { male: "pNInz6obpgDQGcFmaJgB", female: "21m00Tcm4TlvDq8ikWAM", neutral: "21m00Tcm4TlvDq8ikWAM" };
export async function defaultVoiceId(gender: "male" | "female" | "neutral"): Promise<string> {
  const env = gender === "male" ? Bun.env.ELEVENLABS_DEFAULT_MALE : gender === "female" ? Bun.env.ELEVENLABS_DEFAULT_FEMALE : Bun.env.ELEVENLABS_DEFAULT_NEUTRAL;
  if (env && env.trim()) return env.trim();
  const list = await premadeVoices();
  const want = gender === "neutral" ? "female" : gender;
  const match = list.find((v) => v.gender === want) || list[0];
  return match ? match.id : FALLBACK_VOICES[gender];
}

export async function voiceSelfTest(voiceId: string | null): Promise<{ ok: boolean; detail: string }> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key) return { ok: false, detail: "ELEVENLABS_API_KEY is not set" };
  if (!voiceId) {
    const u = await elevenLabsUsage();
    return u ? { ok: true, detail: "no cloned voices saved yet; ElevenLabs account reachable" } : { ok: false, detail: "ElevenLabs account not reachable" };
  }
  const audio = await synthesizeSpeech("Hi", voiceId);
  if (audio && audio.length > 500) return { ok: true, detail: "cloned voice spoke (" + audio.length + " bytes)" };
  return { ok: false, detail: lastSynthError || "no audio returned" };
}

// Monthly character usage vs. plan limit (for the daily self-check). Needs a
// key with "User: read" permission; returns null when unavailable.
export type VoiceUsage = { used: number; limit: number; resetsAt: number | null; voices: number | null; voiceLimit: number | null };
export async function elevenLabsUsage(): Promise<VoiceUsage | null> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(ELEVENLABS_BASE + "/user/subscription", { headers: { "xi-api-key": key } });
    if (!res.ok) return null;
    const j: any = await res.json();
    if (typeof j?.character_count !== "number" || typeof j?.character_limit !== "number") return null;
    return {
      used: j.character_count,
      limit: j.character_limit,
      resetsAt: typeof j.next_character_count_reset_unix === "number" ? j.next_character_count_reset_unix : null,
      voices: typeof j.voice_slots_used === "number" ? j.voice_slots_used : null,
      voiceLimit: typeof j.voice_limit === "number" ? j.voice_limit : null,
    };
  } catch { return null; }
}
