// A bare US state name ("California") makes the geocoder pick a small town
// of the same name in another state (California, Missouri). When someone
// types just a state, use that state's largest city instead.
const STATE_CITY: Record<string, string> = {
  alabama: "Birmingham", alaska: "Anchorage", arizona: "Phoenix", arkansas: "Little Rock", california: "Los Angeles",
  colorado: "Denver", connecticut: "Bridgeport", delaware: "Wilmington", florida: "Jacksonville",
  hawaii: "Honolulu", idaho: "Boise", illinois: "Chicago", indiana: "Indianapolis", iowa: "Des Moines",
  kansas: "Wichita", kentucky: "Louisville", louisiana: "New Orleans", maine: "Portland", maryland: "Baltimore",
  massachusetts: "Boston", michigan: "Detroit", minnesota: "Minneapolis", mississippi: "Jackson", missouri: "Kansas City",
  montana: "Billings", nebraska: "Omaha", nevada: "Las Vegas", "new hampshire": "Manchester", "new jersey": "Newark",
  "new mexico": "Albuquerque", "new york state": "New York", "north carolina": "Charlotte", "north dakota": "Fargo",
  ohio: "Columbus", oklahoma: "Oklahoma City", oregon: "Portland", pennsylvania: "Philadelphia", "rhode island": "Providence",
  "south carolina": "Charleston", "south dakota": "Sioux Falls", tennessee: "Nashville", texas: "Houston", utah: "Salt Lake City",
  vermont: "Burlington", virginia: "Virginia Beach", "west virginia": "Charleston", wisconsin: "Milwaukee", wyoming: "Cheyenne",
};
// Accepts "California", "california, usa", "California, United States"; leaves everything else alone.
export function expandUsState(q: string): string {
  const k = (q || "").trim().toLowerCase().replace(/,?\s*(usa|u\.s\.a\.|us|u\.s\.|united states( of america)?)$/, "").trim();
  return STATE_CITY[k] || q;
}
