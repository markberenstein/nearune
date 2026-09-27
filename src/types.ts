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
export type PersonProfile = { name: string; location: string; language: string; tz?: string; confirmed: boolean; emailHash?: string };

// A browser's Web Push subscription (from the PushSubscription object) —
// endpoint + keys needed to encrypt and deliver a push to that browser.
// Existing records predate the `kind` tag (they're all Web Push, from
// before the native app existed) — treat a missing `kind` as "web".
export type WebPushSubscriptionRecord = { kind?: "web"; endpoint: string; keys: { p256dh: string; auth: string } };
// A device token from the native iOS app (Capacitor's PushNotifications
// plugin), delivered via Apple Push Notification service instead.
export type ApnsSubscriptionRecord = { kind: "apns"; token: string };
export type PushSubscriptionRecord = WebPushSubscriptionRecord | ApnsSubscriptionRecord;

export type State = {
  version: number;
  answers: Record<string, Partial<Record<PersonKey, Answer>>>;
  status: Partial<Record<PersonKey, { text: string; at: string }>>;
  comments: Record<string, Comment[]>;
  people?: Partial<Record<PersonKey, PersonProfile>>;
  pendingConfirm?: Partial<Record<PersonKey, { token: string; at: string }>>;
  pendingInvite?: Partial<Record<PersonKey, { token: string; at: string }>>;
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
