// Nearune — shared types.

export type PersonKey = "mark" | "nikita";
// Internal slot names only — every room has two of these slots, and each
// room's registration flow assigns the real display name/location/language
// per slot. They don't imply the room's actual people are named Mark/Nikita.

export type Answer = { text: string; at: string; editedAt?: string };
export type Comment = { who: PersonKey; text: string; at: string };
// tz is captured automatically from the registering browser (IANA zone,
// e.g. "Asia/Bangkok") — not typed by hand, since free-text "location"
// (city name) isn't reliably mappable to a timezone.
// emailHash: a one-way keyed hash of the email used to register (see
// util.ts hashEmail) — kept so a room deletion can also clean up that
// person's entry in the recovery index. The actual address is never stored.
// voiceId: the cloned-voice id from whichever provider is behind
// voice.ts's synthesizeSpeech() (ElevenLabs today) — server-only, like
// puzzleAnswer. forClient() strips it before sending state to a browser and
// replaces it with the boolean hasVoice, so the client (and anyone
// inspecting network traffic) only ever learns "yes/no", never an id that
// could be replayed directly against the provider.
// travelLocation/travelTz/travelFrom/travelUntil/travelShowEarly: an
// optional temporary override of WHERE this person is shown as being —
// their weather, local-lore line, AND clock (see util.ts's
// effectiveLocation/effectiveTz/isTraveling), nothing else. Their real
// `location`, `tz` and everything tied to it (the daily rollover, their
// registered city) stay exactly as registered; travel only changes what
// city/timezone feeds their partner's "what's it like where they are"
// widgets and clock.
// - travelTz is resolved automatically from travelLocation the same way
//   registration resolves tz from location (see geo.ts) — never typed by
//   hand.
// - travelFrom/travelUntil are optional date keys (YYYY-MM-DD, same format
//   as todayKeyPT) letting travel be scheduled ahead of time rather than
//   starting the moment it's saved: before travelFrom, nothing changes yet;
//   once travelUntil has passed, effectiveLocation/effectiveTz revert to
//   `location`/`tz` on their own. No travelFrom means it's active
//   immediately; no travelUntil means it stays set until cleared.
// - travelShowEarly opts into showing the travel override starting
//   TRAVEL_EARLY_DAYS days before travelFrom instead of exactly on it, so a
//   partner gets a few days' heads-up. Only meaningful alongside a future
//   travelFrom.
export type PersonProfile = {
  name: string;
  location: string;
  language: string;
  tz?: string;
  confirmed: boolean;
  emailHash?: string;
  // Instagram username (no "@"), set when this person signed up with a
  // handle instead of an email, shown to their partner as a tappable link.
  // UNVERIFIED — anyone can type any handle, so it's only ever a label,
  // never proof of identity (a handle sign-up has no email, hence no email
  // recovery either).
  instagram?: string;
  voiceId?: string;
  hasVoice?: boolean;
  // ISO timestamp of the last photo this person shared (see storage.ts's
  // photoKey) — absence means they haven't shared one. Doubles as a
  // cache-busting value for the image URL (GET /api/photo?who=...&v=...),
  // same idea as hasVoice but a timestamp instead of a boolean since the
  // client needs it to know when to refetch a replaced photo.
  photoAt?: string;
  travelLocation?: string;
  travelTz?: string;
  travelFrom?: string;
  travelUntil?: string;
  travelShowEarly?: boolean;
};

// A browser's Web Push subscription (from the PushSubscription object) —
// endpoint + keys needed to encrypt and deliver a push to that browser.
// Existing records predate the `kind` tag (they're all Web Push, from
// before the native app existed) — treat a missing `kind` as "web".
export type WebPushSubscriptionRecord = { kind?: "web"; endpoint: string; keys: { p256dh: string; auth: string } };
// A device token from the native iOS app (Capacitor's PushNotifications
// plugin), delivered via Apple Push Notification service instead.
export type ApnsSubscriptionRecord = { kind: "apns"; token: string };
export type PushSubscriptionRecord = WebPushSubscriptionRecord | ApnsSubscriptionRecord;

// How the two people in a room relate to each other — set once, by whoever
// registers first, and shared by the room rather than tracked per-person
// (it describes the pair, not either individual). Picks which of page.ts's
// three QUESTIONS pools the daily question is drawn from. A room with no
// relationship set (every room created before this field existed, which
// includes the legacy main room) defaults to "significant_other" — see
// questionPoolFor() in page.ts — so existing rooms keep exactly the
// questions they've always gotten. "its_complicated" also uses the
// significant_other pool (same questionPoolFor() default branch) — it's
// offered as its own label so people aren't forced into "family"/"friend"
// when neither fits, but the questions are the significant-other ones.
export type RelationshipType = "significant_other" | "family" | "friend" | "its_complicated";

export type State = {
  version: number;
  // ISO timestamp set once, when the room is first created — only present on
  // rooms created after this field was added; older rooms show as unknown in
  // the admin view rather than guessing a date.
  createdAt?: string;
  relationship?: RelationshipType;
  answers: Record<string, Partial<Record<PersonKey, Answer>>>;
  status: Partial<Record<PersonKey, { text: string; at: string }>>;
  comments: Record<string, Comment[]>;
  people?: Partial<Record<PersonKey, PersonProfile>>;
  pendingConfirm?: Partial<Record<PersonKey, { token: string; at: string }>>;
  pendingInvite?: Partial<Record<PersonKey, { token: string; at: string; instagram?: string }>>;
  // Server-computed on every response (never persisted, see forClient) —
  // the Instagram handle an invite was addressed to, if it went to a handle
  // rather than an email.
  pendingInviteHandle?: Partial<Record<PersonKey, string>>;
  puzzleCurrentId?: string;
  // Server-computed on every response (not persisted) — how many pieces of
  // the current picture are unlocked, including the streak speed-up.
  puzzleUnlocked?: number;
  puzzleAnswer?: string;
  // What the guesser is being asked, e.g. "Where was this taken?" — defaults
  // to that when whoever loaded the photo left it blank, but they can type
  // any question they like instead (not secret, unlike puzzleAnswer).
  puzzleQuestion?: string;
  puzzleSetBy?: PersonKey;
  puzzleRoundBase?: number; // legacy field, no longer written; kept for old snapshots
  puzzleRoundStartDate?: string; // date key (PT) this photo's round started
  puzzleBonusCredits?: number; // extra pieces granted by correct guesses on prior photos
  puzzleSolved?: boolean;
  puzzleSolvedCount?: number;
  puzzlePendingBonus?: boolean;
  puzzleLastGuessDate?: string;
  puzzleLastGuessBy?: PersonKey;
  puzzleLastGuessText?: string;
  puzzleLastGuessCorrect?: boolean;
  puzzleQueue?: { id: string; answer: string; question?: string }[];
  puzzleQueueBy?: PersonKey;
  puzzleQueueAt?: string;
  puzzleQueueTotal?: number;
  // Web Push subscriptions per person, and the last date key (PT) the
  // morning "new question" push was sent for, so the daily cron job never
  // double-sends if it fires more than once for the same day.
  pushSubs?: Partial<Record<PersonKey, PushSubscriptionRecord>>;
  pushLastMorningKey?: string;
};

export function isPerson(v: unknown): v is PersonKey {
  return v === "mark" || v === "nikita";
}
