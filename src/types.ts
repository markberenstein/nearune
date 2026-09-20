// Same Sky — shared types.

export type PersonKey = "mark" | "nikita";
// Internal slot names only — every room has two of these slots, and each
// room's registration flow assigns the real display name/location/language
// per slot. They don't imply the room's actual people are named Mark/Nikita.

export type Answer = { text: string; at: string; editedAt?: string };
export type Comment = { who: PersonKey; text: string; at: string };
export type PersonProfile = { name: string; location: string; language: string; confirmed: boolean };
export type State = {
  version: number;
  answers: Record<string, Partial<Record<PersonKey, Answer>>>;
  status: Partial<Record<PersonKey, { text: string; at: string }>>;
  comments: Record<string, Comment[]>;
  people?: Partial<Record<PersonKey, PersonProfile>>;
  pendingConfirm?: Partial<Record<PersonKey, { token: string; at: string }>>;
  pendingInvite?: Partial<Record<PersonKey, { token: string; at: string }>>;
  puzzleCurrentId?: string;
  puzzleAnswer?: string;
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
  puzzleQueue?: { id: string; answer: string }[];
  puzzleQueueBy?: PersonKey;
  puzzleQueueAt?: string;
  puzzleQueueTotal?: number;
};

export function isPerson(v: unknown): v is PersonKey {
  return v === "mark" || v === "nikita";
}
