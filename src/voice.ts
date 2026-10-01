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
      } catch {}
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
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}
