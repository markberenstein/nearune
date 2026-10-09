// Nearune — voice cloning & text-to-speech ("vocalizer"). ElevenLabs is the
// only provider wired up today, but every caller (server.ts) only ever goes
// through cloneVoice() / synthesizeSpeech() / deleteVoice() below — the same
// shape as util.ts's sendEmail() wrapping sendViaResend()/sendViaSendGrid()
// — so swapping to a different voice provider later (Play.ht, Resemble.ai,
// Azure, etc.) means rewriting the insides of these three functions, not
// anything that calls them.

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

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
    const ext = mimeType.includes("webm") ? "webm" : mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
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
export async function synthesizeSpeech(text: string, voiceId: string): Promise<Uint8Array | null> {
  const key = Bun.env.ELEVENLABS_API_KEY;
  if (!key || !voiceId || !text.trim()) return null;
  try {
    const res = await fetch(ELEVENLABS_BASE + "/text-to-speech/" + encodeURIComponent(voiceId), {
      method: "POST",
      headers: { "xi-api-key": key, "content-type": "application/json" },
      // eleven_multilingual_v2 — the cloned voice can speak any of the
      // app's supported languages, not just whatever language the sample
      // was recorded in (useful here since this also voices the OTHER
      // person's translated text back in the listener's own language).
      //
      // voice_settings: without this, ElevenLabs falls back to defaults
      // (stability 0.5 / similarity_boost 0.5), which leave more room for
      // the model to "wander" away from the actual sample — including
      // picking up a faint accent that isn't really there, since stability
      // is literally the lever ElevenLabs' own docs point to for that
      // ("if the voice starts to wander or produce artifacts, raise
      // stability"). Nudged up from default rather than maxed out, since
      // pushing stability too close to 1.0 tends to flatten delivery into
      // a monotone instead.
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.7, similarity_boost: 0.85 },
      }),
    });
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
