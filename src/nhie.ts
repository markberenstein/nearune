// Nearune — "Never Have I Ever" tab. A shared round holds one phrase; each
// partner secretly answers (grin = never have I, shot = I have), and the
// answers are revealed once both are in. The phrase text itself is stored in
// the room state, so both people always see the same one and the page can
// translate it like any other shared text.

import type { RelationshipType, State } from "./types";

const COUPLE: string[] = [
  "Never have I ever sent a text to the wrong person.",
  "Never have I ever pretended to be asleep to avoid a conversation.",
  "Never have I ever stalked an ex online.",
  "Never have I ever fallen asleep on a video call with you.",
  "Never have I ever googled a symptom and convinced myself the worst.",
  "Never have I ever cried at a movie and blamed allergies.",
  "Never have I ever kept a secret gift hidden for weeks.",
  "Never have I ever sung in the shower at full volume.",
  "Never have I ever practiced a conversation with you in the mirror.",
  "Never have I ever reread our old messages just to smile.",
  "Never have I ever stayed up way too late just to talk to you.",
  "Never have I ever lied about how much I spent on something.",
  "Never have I ever been jealous of something you did that I wasn't part of.",
  "Never have I ever said I was five minutes away when I hadn't left yet.",
  "Never have I ever eaten something off the floor.",
  "Never have I ever laughed so hard I cried at the wrong moment.",
  "Never have I ever forgotten an important date and bluffed my way through.",
  "Never have I ever screenshotted one of our chats to show a friend.",
  "Never have I ever muted a group chat and never looked back.",
  "Never have I ever had a crush on a teacher.",
  "Never have I ever gotten lost while using GPS.",
  "Never have I ever talked to myself out loud when I thought no one could hear.",
  "Never have I ever missed a flight or a train.",
  "Never have I ever sent a message and instantly wished I could unsend it.",
  "Never have I ever planned our next visit in way too much detail.",
  "Never have I ever kept a keepsake from one of our moments together.",
  "Never have I ever pretended to like a gift.",
  "Never have I ever lied about having read a book.",
  "Never have I ever danced alone in the kitchen.",
  "Never have I ever worn the same outfit three days in a row.",
  "Never have I ever blamed the time zone for a missed call when it was really me.",
  "Never have I ever practiced my language skills just to impress you.",
  "Never have I ever had a dream about you that I never told you about.",
  "Never have I ever Googled how to say something in your language.",
  "Never have I ever hidden a snack so I wouldn't have to share it.",
  "Never have I ever been so excited to see you that I couldn't sleep the night before.",
  "Never have I ever fallen asleep in a movie theater.",
  "Never have I ever taken a selfie and deleted twenty before posting one.",
  "Never have I ever been caught talking about you with a huge grin.",
  "Never have I ever ordered food just so I wouldn't have to cook.",
  "Never have I ever ignored an alarm clock three times in a row.",
  "Never have I ever told a white lie to get out of plans.",
  "Never have I ever been embarrassed by my own ringtone.",
  "Never have I ever stayed in my pajamas all day.",
  "Never have I ever laughed at something I shouldn't have.",
  "Never have I ever practiced a toast or a speech to no one.",
  "Never have I ever worried you'd think something I said was silly.",
  "Never have I ever made up a nickname for you that I haven't told you.",
  "Never have I ever tried to cook something for you and failed.",
  "Never have I ever rewatched a show just because it reminded me of you.",
  "Never have I ever crashed a party I wasn't invited to.",
  "Never have I ever had a first impression of you that turned out completely wrong.",
  "Never have I ever shed a tear while we said goodbye.",
  "Never have I ever counted down the days until we'd see each other.",
  "Never have I ever kissed someone on the first date.",
  "Never have I ever done something spontaneous that I regretted right away.",
  "Never have I ever shown up early just to see your reaction.",
  "Never have I ever been tipsy and texted you something silly.",
  "Never have I ever fibbed about my age or my weight.",
  "Never have I ever had a nickname I secretly hated.",
  "Never have I ever kept an old photo of us on my phone that I never showed anyone.",
  "Never have I ever wondered what you were doing at that exact moment.",
  "Never have I ever been so tired I texted gibberish.",
  "Never have I ever pretended to understand a joke.",
  "Never have I ever made a bucket list with you on it.",
  "Never have I ever been scared to tell you how I feel.",
  "Never have I ever driven somewhere just to hear a song.",
  "Never have I ever told a stranger about you.",
  "Never have I ever broken something and hid the evidence.",
  "Never have I ever snuck out of the house.",
  "Never have I ever taken a long bath just to avoid chores.",
  "Never have I ever fallen asleep while watching something we were supposed to watch together.",
  "Never have I ever practiced my signature.",
  "Never have I ever kept a diary.",
  "Never have I ever fallen in love with a song because of you.",
];

const FRIEND: string[] = COUPLE.filter((p) => !/kiss|crush|miss(ed)? you|imagin|love|nickname for you|pajamas/i.test(p)).concat([
  "Never have I ever borrowed something from you and not returned it.",
  "Never have I ever told a friend I was busy when I just wanted to stay home.",
  "Never have I ever been the last one to leave a party.",
  "Never have I ever laughed at one of your texts without replying.",
  "Never have I ever forgotten a friend's birthday.",
  "Never have I ever been sure you'd text first and then I did.",
]);

const FAMILY: string[] = [
  "Never have I ever called you by the wrong name.",
  "Never have I ever blamed a sibling or relative for something I did.",
  "Never have I ever lied about where I was going.",
  "Never have I ever pretended to like a family recipe.",
  "Never have I ever laughed at a family photo.",
  "Never have I ever forgotten a family birthday.",
  "Never have I ever told a white lie to get out of a family event.",
  "Never have I ever cried at a family movie night.",
  "Never have I ever sneaked a snack before dinner.",
  "Never have I ever fallen asleep during a family gathering.",
  "Never have I ever kept something secret from the whole family.",
  "Never have I ever hidden a bad grade or report card.",
  "Never have I ever borrowed something and never returned it.",
  "Never have I ever practiced a speech for a family event.",
  "Never have I ever missed a flight home.",
  "Never have I ever pretended to be sick to skip something.",
  "Never have I ever sent a text to the wrong family member.",
  "Never have I ever missed hearing your voice.",
  "Never have I ever reread your old messages.",
  "Never have I ever told a story about you to a stranger.",
  "Never have I ever gotten lost on a family trip.",
  "Never have I ever eaten the last piece and blamed someone else.",
  "Never have I ever danced at a family wedding.",
  "Never have I ever hidden a gift so well I forgot where it was.",
];

export function nhiePool(rel?: RelationshipType): string[] {
  if (rel === "family") return FAMILY;
  if (rel === "friend") return FRIEND;
  return COUPLE;
}

export type NhieRound = NonNullable<State["nhie"]>;

// Draws a phrase that hasn't been used recently in this room.
export function drawPhrase(rel: RelationshipType | undefined, recent: string[]): string {
  const pool = nhiePool(rel);
  const fresh = pool.filter((p) => !recent.includes(p));
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(Math.random() * from.length)];
}

export function newRound(prev: State["nhie"], rel: RelationshipType | undefined): NhieRound {
  const recent = [...(prev?.recent || []), ...(prev?.text ? [prev.text] : [])].slice(-30);
  return { round: (prev?.round || 0) + 1, text: drawPhrase(rel, recent), votes: {}, recent };
}
