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

// Two-letter US postal abbreviations to state names (lower case).
export const US_ABBR: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky",
  LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri",
  MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina",
  ND: "north dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
};

// Abbreviations for first-level regions, by lower-case country code. Names are normalised (lower case, no accents).
export const REGION_ABBR: Record<string, Record<string, string>> = {
  us: Object.fromEntries(Object.entries(US_ABBR).map(([ab, name]) => [name, ab])),
  ca: {
    "alberta": "AB", "british columbia": "BC", "manitoba": "MB", "new brunswick": "NB", "newfoundland and labrador": "NL",
    "nova scotia": "NS", "ontario": "ON", "prince edward island": "PE", "quebec": "QC", "saskatchewan": "SK",
    "northwest territories": "NT", "nunavut": "NU", "yukon": "YT",
  },
  au: {
    "new south wales": "NSW", "victoria": "VIC", "queensland": "QLD", "western australia": "WA", "south australia": "SA",
    "tasmania": "TAS", "australian capital territory": "ACT", "northern territory": "NT",
  },
};
export function regionAbbr(countryCode: string, region: string): string {
  const m = REGION_ABBR[String(countryCode || "").toLowerCase()];
  if (!m) return "";
  return m[String(region || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase()] || "";
}
