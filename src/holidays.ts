// Public holidays where each person is (Mark, Nov 26): shown above today's
// question as "Thanksgiving today in the United States", with a short
// "What is it?" explanation folded away underneath.
//
// Source: Google's public holiday calendar for the country (covers every
// country, including India's festivals), with Nager.Date as a fallback.
// Only entries marked as public holidays count; observances are skipped.
// The explanation is 2-3 plain sentences from Claude Haiku, written once per
// holiday and cached. Everything is English here; the page shows it in the
// reader's own language.

import { recordClaude } from "./usage";
import { readSideFile, writeSideFile } from "./storage";

export type Holiday = { name: string; about: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const listCache = new Map<string, { at: number; days: Record<string, string[]> }>();

function icsUnfold(text: string): string[] {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
}

// date (YYYY-MM-DD) -> holiday names, from Google's calendar for one country.
async function fromGoogle(cc: string): Promise<Record<string, string[]> | null> {
  const id = encodeURIComponent("en." + cc.toLowerCase() + "#holiday@group.v.calendar.google.com");
  try {
    const res = await fetch("https://calendar.google.com/calendar/ical/" + id + "/public/basic.ics", { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const lines = icsUnfold(await res.text());
    const out: Record<string, string[]> = {};
    let cur: { date?: string; summary?: string; desc?: string } | null = null;
    for (const line of lines) {
      if (line === "BEGIN:VEVENT") cur = {};
      else if (line === "END:VEVENT") {
        if (cur && cur.date && cur.summary && /public holiday/i.test(cur.desc || "")) {
          (out[cur.date] = out[cur.date] || []).push(cur.summary);
        }
        cur = null;
      } else if (cur) {
        const m = line.match(/^DTSTART[^:]*:(\d{4})(\d{2})(\d{2})/);
        if (m) cur.date = m[1] + "-" + m[2] + "-" + m[3];
        else if (line.startsWith("SUMMARY:")) cur.summary = line.slice(8).replace(/\\,/g, ",").replace(/\\;/g, ";").trim();
        else if (line.startsWith("DESCRIPTION:")) cur.desc = line.slice(12);
      }
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

async function fromNager(cc: string, year: number): Promise<Record<string, string[]> | null> {
  try {
    const res = await fetch("https://date.nager.at/api/v3/PublicHolidays/" + year + "/" + cc.toUpperCase(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const list: any[] = await res.json();
    const out: Record<string, string[]> = {};
    for (const h of list || []) {
      if (!h || !h.date || !h.name) continue;
      if (h.global === false) continue; // regional only
      (out[h.date] = out[h.date] || []).push(String(h.name));
    }
    return out;
  } catch {
    return null;
  }
}

async function holidayDays(cc: string, year: number): Promise<Record<string, string[]>> {
  const key = cc + ":" + year;
  const hit = listCache.get(key);
  if (hit && Date.now() - hit.at < DAY_MS) return hit.days;
  const days = (await fromGoogle(cc)) || (await fromNager(cc, year)) || {};
  listCache.set(key, { at: Date.now(), days });
  return days;
}

const ABOUT_FILE = "holiday-about.json";
let aboutCache: Record<string, string> | null = null;
async function explain(name: string, countryName: string): Promise<string> {
  const key = countryName + "|" + name;
  if (!aboutCache) {
    try { aboutCache = JSON.parse((await readSideFile(ABOUT_FILE)) || "{}"); } catch { aboutCache = {}; }
  }
  if (aboutCache![key]) return aboutCache![key];
  const apiKey = Bun.env.ANTHROPIC_API_KEY;
  if (!apiKey) return "";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 160,
        system:
          "You explain a public holiday to someone in another country whose loved one is celebrating it. " +
          "Write 2 or 3 short, warm, plain sentences: what it marks and how people there usually celebrate it. " +
          "No dates, no history lecture, no politics, no lists, no emoji. If you don't know this holiday, reply with nothing.",
        messages: [{ role: "user", content: name + " in " + countryName }],
      }),
    });
    if (!res.ok) return "";
    const data: any = await res.json();
    recordClaude("holiday", data);
    const text = String(data?.content?.[0]?.text || "").trim();
    if (text) {
      aboutCache![key] = text;
      writeSideFile(ABOUT_FILE, JSON.stringify(aboutCache)).catch(() => {});
    }
    return text;
  } catch {
    return "";
  }
}

// The public holiday(s) today in a country, `day` being the person's own
// local date (YYYY-MM-DD).
export async function holidaysOn(cc: string, day: string, countryName: string): Promise<Holiday[]> {
  if (!cc || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const days = await holidayDays(cc, Number(day.slice(0, 4)));
  const names = Array.from(new Set(days[day] || [])).slice(0, 2);
  const out: Holiday[] = [];
  for (const name of names) out.push({ name, about: await explain(name, countryName) });
  return out;
}
