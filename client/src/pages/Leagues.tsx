import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const NBA_TEAMS = [
  { name: "Atlanta Hawks", id: "Atlanta Hawks" },
  { name: "Boston Celtics", id: "Boston Celtics" },
  { name: "Brooklyn Nets", id: "Brooklyn Nets" },
  { name: "Charlotte Hornets", id: "Charlotte Hornets" },
  { name: "Chicago Bulls", id: "Chicago Bulls" },
  { name: "Cleveland Cavaliers", id: "Cleveland Cavaliers" },
  { name: "Dallas Mavericks", id: "Dallas Mavericks" },
  { name: "Denver Nuggets", id: "Denver Nuggets" },
  { name: "Detroit Pistons", id: "Detroit Pistons" },
  { name: "Golden State Warriors", id: "Golden State Warriors" },
  { name: "Houston Rockets", id: "Houston Rockets" },
  { name: "Indiana Pacers", id: "Indiana Pacers" },
  { name: "LA Clippers", id: "LA Clippers" },
  { name: "Los Angeles Lakers", id: "Los Angeles Lakers" },
  { name: "Memphis Grizzlies", id: "Memphis Grizzlies" },
  { name: "Miami Heat", id: "Miami Heat" },
  { name: "Milwaukee Bucks", id: "Milwaukee Bucks" },
  { name: "Minnesota Timberwolves", id: "Minnesota Timberwolves" },
  { name: "New Orleans Pelicans", id: "New Orleans Pelicans" },
  { name: "New York Knicks", id: "New York Knicks" },
  { name: "Oklahoma City Thunder", id: "Oklahoma City Thunder" },
  { name: "Orlando Magic", id: "Orlando Magic" },
  { name: "Philadelphia 76ers", id: "Philadelphia 76ers" },
  { name: "Phoenix Suns", id: "Phoenix Suns" },
  { name: "Portland Trail Blazers", id: "Portland Trail Blazers" },
  { name: "Sacramento Kings", id: "Sacramento Kings" },
  { name: "San Antonio Spurs", id: "San Antonio Spurs" },
  { name: "Toronto Raptors", id: "Toronto Raptors" },
  { name: "Utah Jazz", id: "Utah Jazz" },
  { name: "Washington Wizards", id: "Washington Wizards" },
];

const G_LEAGUE_TEAMS = [
  { name: "Austin Spurs", id: "Austin Spurs" },
  { name: "Birmingham Squadron", id: "Birmingham Squadron" },
  { name: "Capital City Go-Go", id: "Capital City Go-Go" },
  { name: "Cleveland Charge", id: "Cleveland Charge" },
  { name: "College Park Skyhawks", id: "College Park Skyhawks" },
  { name: "Delaware Blue Coats", id: "Delaware Blue Coats" },
  { name: "Fort Wayne Mad Ants", id: "Fort Wayne Mad Ants" },
  { name: "Grand Rapids Gold", id: "Grand Rapids Gold" },
  { name: "Greensboro Swarm", id: "Greensboro Swarm" },
  { name: "Iowa Wolves", id: "Iowa Wolves" },
  { name: "Lakeland Magic", id: "Lakeland Magic" },
  { name: "Long Island Nets", id: "Long Island Nets" },
  { name: "Maine Celtics", id: "Maine Celtics" },
  { name: "Memphis Hustle", id: "Memphis Hustle" },
  { name: "Mexico City Capitanes", id: "Mexico City Capitanes" },
  { name: "Motor City Cruise", id: "Motor City Cruise" },
  { name: "Oklahoma City Blue", id: "Oklahoma City Blue" },
  { name: "Osceola Magic", id: "Osceola Magic" },
  { name: "Raptors 905", id: "Raptors 905" },
  { name: "Rio Grande Valley Vipers", id: "Rio Grande Valley Vipers" },
  { name: "Salt Lake City Stars", id: "Salt Lake City Stars" },
  { name: "Santa Cruz Warriors", id: "Santa Cruz Warriors" },
  { name: "Sioux Falls Skyforce", id: "Sioux Falls Skyforce" },
  { name: "South Bay Lakers", id: "South Bay Lakers" },
  { name: "Stockton Kings", id: "Stockton Kings" },
  { name: "Texas Legends", id: "Texas Legends" },
  { name: "Westchester Knicks", id: "Westchester Knicks" },
  { name: "Windy City Bulls", id: "Windy City Bulls" },
  { name: "Wisconsin Herd", id: "Wisconsin Herd" },
];

const LEAGUES = [
  {
    name: "NBA",
    tier: "Tier 1: Professional",
    description: "The National Basketball Association - the premier professional basketball league in the world.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg",
    hasTeams: true,
    regions: ["US", "CA"]
  },
  {
    name: "NBA G League",
    tier: "Tier 2: Professional",
    description: "The official minor league organization of the NBA.",
    logoUrl: "https://cdn.nba.com/logos/leagues/logo-gleague.svg",
    hasTeams: true,
    regions: ["US", "CA", "MX"]
  },
  {
    name: "NCAA Division I",
    tier: "Tier 3: Collegiate",
    description: "The highest level of intercollegiate athletics sanctioned by the NCAA.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/d/dd/NCAA_logo.svg",
    regions: ["US"]
  },
  {
    name: "Overtime Elite (OTE)",
    tier: "Tier 4: Professional",
    description: "A professional basketball league for late-stage high school and early college-level players.",
    logoUrl: "/images/ote-logo.png",
    regions: ["US"]
  },
  {
    name: "High School / AAU",
    tier: "Tier 5: Amateur",
    description: "Premier competitive circuit for high school athletes and independent club teams.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/f/f6/Amateur_Athletic_Union_%28logo%29.png",
    regions: ["US", "CA"]
  }
];


export default function Leagues() {
  const [expandedLeague, setExpandedLeague] = useState<string | null>(null);

  const toggleLeague = (name: string) => {
    if (expandedLeague === name) {
      setExpandedLeague(null);
    } else {
      setExpandedLeague(name);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12">
        <h1 className="font-display text-5xl font-bold mb-4">Leagues</h1>
        <p className="text-muted-foreground text-lg">Browse leagues and explore team rosters.</p>
      </div>

      <div className="space-y-6">
        {LEAGUES.map((league) => (
          <div key={league.name}>
            <Card 
              className={`overflow-hidden border-border transition-all cursor-pointer hover:border-primary/50 ${expandedLeague === league.name ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''}`}
              onClick={() => league.hasTeams && toggleLeague(league.name)}
            >
              <div className="flex flex-col md:flex-row items-center p-6 gap-6">
                <div className="w-20 h-20 flex items-center justify-center flex-shrink-0">
                  <img src={league.logoUrl} alt={league.name} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">{league.tier}</div>
                  <div className="flex items-center justify-center md:justify-start gap-3">
                    <CardTitle className="font-display text-3xl">{league.name}</CardTitle>
                    {league.hasTeams && (
                      expandedLeague === league.name ? <ChevronDown className="w-5 h-5 text-primary" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm max-w-2xl mt-2">{league.description}</p>
                </div>
                <div className="flex-shrink-0 bg-muted px-4 py-2 rounded-xl border border-border">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Region</div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {(league as any).regions?.map((region: string) => (
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

            {/* NBA Teams Sub-list */}
            {expandedLeague === "NBA" && league.name === "NBA" && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-4 duration-300 px-2">
                {NBA_TEAMS.map((team) => (
                  <Link key={team.id} href={`/roster/${encodeURIComponent(team.name)}/2023-24`} data-testid={`link-nba-team-${team.id.replace(/\s+/g, '-').toLowerCase()}`}>
                    <Card className="p-3 hover-elevate border-border hover:border-primary/40 cursor-pointer bg-card/50 backdrop-blur-sm">
                      <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-1 truncate">{team.name}</div>
                      <div className="text-sm font-bold truncate">{team.name}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] text-muted-foreground font-mono">View Roster</span>
                        <ArrowRight className="w-3 h-3 text-primary" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}

            {/* G League Teams Sub-list */}
            {expandedLeague === "NBA G League" && league.name === "NBA G League" && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-4 duration-300 px-2">
                {G_LEAGUE_TEAMS.map((team) => (
                  <Link key={team.id} href={`/roster/${encodeURIComponent(team.name)}/2023-24`} data-testid={`link-gleague-team-${team.id.replace(/\s+/g, '-').toLowerCase()}`}>
                    <Card className="p-3 hover-elevate border-border hover:border-primary/40 cursor-pointer bg-card/50 backdrop-blur-sm">
                      <div className="text-[10px] font-mono text-accent uppercase tracking-widest mb-1 truncate">G League</div>
                      <div className="text-sm font-bold truncate">{team.name}</div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[9px] text-muted-foreground font-mono">View Roster</span>
                        <ArrowRight className="w-3 h-3 text-accent" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
