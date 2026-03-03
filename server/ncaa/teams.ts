/**
 * NCAA men's D1 school slugs for Sports Reference URLs.
 * Used by scraper to iterate team season pages: /cbb/schools/{slug}/{year}.html
 */

export const SCHOOL_SLUGS: string[] = [
  "duke", "kentucky", "north-carolina", "kansas", "ucla", "villanova", "connecticut", "arizona",
  "michigan-state", "indiana", "ohio-state", "michigan", "purdue", "wisconsin", "maryland", "louisville",
  "syracuse", "florida", "florida-state", "miami-fl", "virginia", "virginia-tech", "north-carolina-state",
  "georgia-tech", "clemson", "boston-college", "pittsburgh", "notre-dame", "wake-forest",
  "alabama", "auburn", "arkansas", "tennessee", "lsu", "mississippi-state", "ole-miss", "georgia",
  "south-carolina", "texas-am", "missouri", "vanderbilt",
  "baylor", "texas", "texas-tech", "oklahoma", "west-virginia", "iowa-state", "oklahoma-state",
  "kansas-state", "tcu",
  "gonzaga", "saint-marys-ca", "san-diego-state", "byu", "santa-clara", "san-francisco", "portland",
  "oregon", "oregon-state", "washington", "washington-state", "colorado", "utah", "arizona-state",
  "usc", "stanford", "california",
  "houston", "memphis", "cincinnati", "tulane", "temple", "south-florida", "wichita-state",
  "xavier", "creighton", "georgetown", "marquette", "seton-hall", "providence", "st-johns-ny",
  "butler", "depaul",
  "illinois", "iowa", "minnesota", "nebraska", "northwestern", "penn-state", "rutgers",
  "st-bonaventure", "dayton", "saint-louis", "davidson", "vcu", "richmond", "george-mason",
  "utah-state", "nevada", "boise-state", "new-mexico", "wyoming", "fresno-state", "unlv",
  "vermont", "yale", "princeton", "harvard", "pennsylvania", "columbia", "brown", "dartmouth",
  "cornell", "belmont", "murray-state", "morehead-state", "eastern-kentucky", "austin-peay",
  "north-alabama", "lipscomb", "jacksonville-state", "eastern-illinois", "southeast-missouri-state",
  "tennessee-tech", "tennessee-state", "siu-edwardsville", "ut-martin",
];

export function getSchoolSlugs(limit?: number): string[] {
  if (limit == null) return [...SCHOOL_SLUGS];
  return SCHOOL_SLUGS.slice(0, limit);
}
