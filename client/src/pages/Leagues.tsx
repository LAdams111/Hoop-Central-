import { Card, CardTitle } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { Link } from "wouter";

const LEAGUES = [
  {
    name: "NBA",
    slug: "NBA",
    tier: "Tier 1: Professional",
    description: "The National Basketball Association - the premier professional basketball league in the world.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg",
    regions: ["US", "CA"]
  },
  {
    name: "NBA G League",
    slug: "G-League",
    tier: "Tier 2: Professional",
    description: "The official minor league organization of the NBA.",
    logoUrl: "https://cdn.nba.com/logos/leagues/logo-gleague.svg",
    regions: ["US", "CA", "MX"]
  },
  {
    name: "NCAA Division I",
    slug: "NCAA",
    tier: "Tier 3: Collegiate",
    description: "The highest level of intercollegiate athletics sanctioned by the NCAA.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/d/dd/NCAA_logo.svg",
    regions: ["US"]
  },
  {
    name: "Overtime Elite (OTE)",
    slug: "OTE",
    tier: "Tier 4: Professional",
    description: "A professional basketball league for late-stage high school and early college-level players.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/7/73/OvertimeEliteLogo.png",
    regions: ["US"]
  },
  {
    name: "High School",
    slug: "High-School",
    tier: "Tier 5: Amateur",
    description: "Varsity high school basketball programs across the country producing top collegiate and professional talent.",
    regions: ["US", "CA"]
  },
  {
    name: "AAU",
    slug: "AAU",
    tier: "Tier 5: Amateur",
    description: "The Amateur Athletic Union organizes competitive club basketball for youth and high school players nationwide.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/f/f6/Amateur_Athletic_Union_%28logo%29.png",
    regions: ["US"]
  }
];

const INTERNATIONAL_LEAGUES = [
  {
    name: "EuroLeague",
    slug: "EuroLeague",
    tier: "Tier 1: Professional",
    description: "The top-tier European professional basketball club competition, featuring the best teams from across the continent.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/f/fb/Euroleague_Basketball_logo.svg",
    regions: ["EU"]
  },
  {
    name: "Liga ACB",
    slug: "ACB",
    tier: "Tier 1: Professional",
    description: "Spain's premier professional basketball league and one of the strongest domestic leagues in the world.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/e/e7/Liga_Endesa_2019_logo.svg",
    regions: ["ES"]
  },
  {
    name: "NBL Australia",
    slug: "NBL",
    tier: "Tier 1: Professional",
    description: "Australia's top professional basketball league, increasingly a pathway for NBA-bound international talent.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/b/b2/NBL_%28Australia%29_logo.svg",
    regions: ["AU"]
  },
  {
    name: "Basketball Africa League",
    slug: "BAL",
    tier: "Tier 2: Professional",
    description: "The premier professional basketball league on the African continent, backed by the NBA and FIBA.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/b/b0/Basketball_Africa_League.svg",
    regions: ["ZA"]
  },
  {
    name: "Chinese Basketball Association",
    slug: "CBA",
    tier: "Tier 1: Professional",
    description: "China's top professional basketball league with a growing international presence.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/5/53/Chinese_Basketball_Association.svg",
    regions: ["CN"]
  },
  {
    name: "B.League (Japan)",
    slug: "BLeague",
    tier: "Tier 1: Professional",
    description: "Japan's top professional basketball league, known for its passionate fanbase and rising talent development.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/7/7a/B.League_logo.svg",
    regions: ["JP"]
  },
];

function LeagueCard({ league }: { league: { name: string; slug: string; tier: string; description: string; logoUrl?: string; regions: string[] } }) {
  return (
    <Link href={`/leagues/${league.slug}`} data-testid={`link-league-${league.slug.toLowerCase()}`}>
      <Card className="overflow-hidden border-border transition-all cursor-pointer hover:border-primary/50">
        <div className="flex flex-row items-center p-3 md:p-6 gap-3 md:gap-6">
          <div className="w-10 h-10 md:w-20 md:h-20 flex items-center justify-center flex-shrink-0">
            {league.logoUrl ? (
              <img src={league.logoUrl} alt={league.name} className="max-w-full max-h-full object-contain" />
            ) : (
              <div className="w-10 h-10 md:w-16 md:h-16 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display text-base md:text-2xl font-bold">
                {league.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[9px] md:text-xs font-mono text-primary uppercase tracking-widest mb-0.5 md:mb-1">{league.tier}</div>
            <div className="flex items-center gap-2 md:gap-3">
              <CardTitle className="font-display text-lg md:text-3xl truncate">{league.name}</CardTitle>
              <ChevronRight className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground flex-shrink-0" />
            </div>
            <p className="text-muted-foreground text-xs md:text-sm max-w-2xl mt-1 md:mt-2 line-clamp-1 md:line-clamp-none">{league.description}</p>
          </div>
          <div className="hidden md:block flex-shrink-0 bg-muted px-4 py-2 rounded-xl border border-border">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Region</div>
            <div className="flex items-center gap-2 flex-wrap">
              {league.regions.map((region) => (
                <img
                  key={region}
                  src={`https://purecatamphetamine.github.io/country-flag-icons/3x2/${region}.svg`}
                  alt={region}
                  title={region}
                  className="w-7 h-5 rounded-sm border border-border/50 object-cover"
                />
              ))}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export default function Leagues() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 md:mb-12">
        <h1 className="font-display text-3xl md:text-5xl font-bold mb-2 md:mb-4">Leagues</h1>
        <p className="text-muted-foreground text-sm md:text-lg">Browse leagues and explore team rosters.</p>
      </div>

      <div className="space-y-3 md:space-y-6">
        {LEAGUES.map((league) => (
          <LeagueCard key={league.name} league={league} />
        ))}
      </div>

      <div className="mt-10 md:mt-16 mb-6 md:mb-12">
        <h2 className="font-display text-2xl md:text-4xl font-bold mb-2 md:mb-4">International</h2>
        <p className="text-muted-foreground text-sm md:text-lg">Professional basketball leagues from around the globe.</p>
      </div>

      <div className="space-y-3 md:space-y-6">
        {INTERNATIONAL_LEAGUES.map((league) => (
          <LeagueCard key={league.name} league={league} />
        ))}
      </div>
    </div>
  );
}
