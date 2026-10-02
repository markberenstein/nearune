// Nearune — fun, openly-invented "neighborhood lore" line for a free-text
// location. SANDBOX EXPERIMENT: this used to pull a REAL Google News
// headline for each person's area (biased toward lighter/fun stories via
// a rotating daily theme) — but real local news mostly turns out to be
// ribbon-cuttings, city-council votes, and minor business items, not the
// kind of delightful nonsense two people actually want to share ("ooh, in
// Delhi, monkeys apparently..."). So this is now a pure made-up vignette
// generator instead of a news fetch: no API, no key, nothing to go stale
// or rate-limit against — same spirit as translate.ts's Gibberish/Klingon
// generators, just whimsical "local folklore" instead of a language.
// Shown as a single line between the Today/Puzzle content and the "next
// question" countdown — see page.ts's newsLineBlock().

import { todayKeyPT } from "./util";

export type LocalStory = { headline: string } | null;

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Each line slots a free-text location in via {location} and is written
// to read like cheerful, obviously-invented neighborhood folklore —
// wandering animals, pop-up art, tiny parades, odd little traditions —
// never like a real headline, so nobody mistakes it for actual news about
// where their partner lives.
const VIGNETTES: string[] = [
  "Local artists in {location} are reportedly plotting a surprise mural across three blocks downtown — rumor is it'll be finished by sunrise.",
  "A small troop of mischievous monkeys has apparently taken up residence in the fountains of {location}, stealing sunglasses and the occasional sandwich.",
  "Word around {location} is that a marching band of kazoo players appears out of nowhere every full moon.",
  "Someone in {location} built a Rube Goldberg machine just to water one houseplant — neighbors are reportedly obsessed.",
  "A flock of pigeons in {location} has allegedly learned to recognize the mail carrier's whistle and now escorts them door to door.",
  "Local legend says a giant chalk dragon appears on the sidewalks of {location} every time it rains, then washes away by noon.",
  "Rumor has it a pop-up night market selling nothing but tiny hats has taken over a side street in {location}.",
  "A group of retirees in {location} reportedly started an underground synchronized-swimming club that meets at dawn.",
  "Someone spotted a hot air balloon shaped like a teapot drifting low over {location} this week — nobody's claimed it yet.",
  "Local cats in {location} have apparently unionized and are demanding better rooftop access, according to absolutely nobody official.",
  "A traveling puppet troupe is said to be staging an opera entirely about lost socks somewhere in {location}.",
  "Word is a bakery in {location} accidentally invented a croissant that whistles when it's done baking.",
  "A mysterious gnome statue keeps appearing in different yards across {location}, always holding a tiny sign that says 'hello'.",
  "Local kids in {location} claim a squirrel has been running a very small, very serious lemonade stand.",
  "Someone painted an entire crosswalk in {location} to look like piano keys, and now everyone tiptoes across humming showtunes.",
  "Rumor has it {location}'s oldest tree is covered in hand-knit sweaters every winter by an anonymous 'yarn bomber'.",
  "A flash mob of accordion players reportedly ambushed the farmers market in {location} last weekend, much to everyone's delight.",
  "Local legend claims a very polite raccoon in {location} has taken to returning dropped mittens to porches.",
  "Someone in {location} apparently trained their parrot to recite the weather forecast, and it's oddly more accurate than the news.",
  "A secret society of amateur kite-builders is said to gather at dawn over {location}, launching increasingly elaborate dragons.",
  "Word is a food truck in {location} now serves soup exclusively shaped like clouds, and nobody can explain how.",
  "Local rumor: a brass band ambushes unsuspecting joggers in {location} every Saturday morning, just for fun.",
  "A duck has reportedly adopted the front steps of a café in {location} as its personal throne.",
  "Someone built a tiny free library shaped like a lighthouse on a corner in {location}, and it's somehow always perfectly stocked.",
  "Local legend holds that the fountains in {location} briefly turn the color of whatever fruit is in season.",
  "A troupe of unicyclists has reportedly been seen weaving through the farmers market in {location}, selling kazoos as they go.",
  "Someone in {location} apparently keeps leaving tiny painted rocks with jokes on them along the main trail.",
  "Word is a group of office workers in {location} started a lunchtime hula-hoop club that's now oddly competitive.",
  "A local theater in {location} is reportedly staging an entire play performed by shadow puppets made of houseplants.",
  "Rumor has it the ice cream shop in {location} invents a wildly impractical flavor every full moon — this month's was apparently 'thunderstorm'.",
  "Someone spotted a very dignified goose leading a line of ducklings directly into the {location} farmers market like it owns the place.",
  "Local legend says a hidden door behind a bakery in {location} leads to a room that's just for naps.",
  "A roving brass quintet has reportedly been serenading dog walkers in {location} at exactly 7am, for reasons nobody can explain.",
  "Word is a community garden in {location} grew a pumpkin shaped suspiciously like a local landmark, and nobody's taking it down.",
  "A self-appointed 'town crier' in {location} has been biking around announcing made-up holidays, and people are into it.",
  "Someone in {location} taught a crow to return lost hair ties, and now there's apparently a small pile waiting on their windowsill each morning.",
  "Rumor has it a tiny brass band of children ambushes the {location} bus stop every Friday with a two-song set and a hat for tips.",
  "A local sign painter in {location} has reportedly been adding one tiny hidden mouse to every shopfront mural in town.",
  "Word is the {location} public pool briefly turned into an impromptu synchronized rubber-duck race last weekend, cause unknown.",
  "Someone spotted a very small parade — just a kazoo, a dog in a cape, and three kids on scooters — looping the block in {location} at dusk.",
];

function fillTemplate(tpl: string, location: string): string {
  return tpl.split("{location}").join(location);
}

// Deterministic per Nearune day + location (see todayKeyPT) — both of you
// see a stable story for a given place that changes once a day, rather
// than one that reshuffles on every poll. Different locations on the same
// day get different vignettes since the location feeds the hash too.
export async function topLocalStory(location: string): Promise<LocalStory> {
  const loc = (location || "").trim();
  if (!loc) return null;
  const key = todayKeyPT() + "|" + loc.toLowerCase();
  const idx = hashStr(key) % VIGNETTES.length;
  return { headline: fillTemplate(VIGNETTES[idx], loc) };
}
