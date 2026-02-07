import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Star, School, Medal, ArrowRight, ChevronRight, ChevronDown } from "lucide-react";
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

const LEAGUES = [
  {
    name: "NBA",
    tier: "Tier 1: Professional (Top)",
    description: "The National Basketball Association - the premier professional basketball league in the world.",
    icon: Trophy,
    color: "text-primary",
    bgColor: "bg-primary/10",
    hasTeams: true,
    countries: ["🇺🇸", "🇨🇦"]
  },
  {
    name: "NBA G League",
    tier: "Tier 2: Professional (Developmental)",
    description: "The official minor league organization of the NBA.",
    icon: Activity,
    color: "text-accent",
    bgColor: "bg-accent/10",
    countries: ["🇺🇸", "🇨🇦", "🇲🇽"]
  },
  {
    name: "NCAA Division I",
    tier: "Tier 3: Collegiate",
    description: "The highest level of intercollegiate athletics sanctioned by the NCAA.",
    icon: School,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    countries: ["🇺🇸"]
  },
  {
    name: "Overtime Elite (OTE)",
    tier: "Tier 4: Professional / Youth",
    description: "A professional basketball league for late-stage high school and early college-level players.",
    icon: Star,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50",
    countries: ["🇺🇸"]
  },
  {
    name: "High School / AAU",
    tier: "Tier 5: Amateur / Youth",
    description: "Premier competitive circuit for high school athletes and independent club teams.",
    icon: Users,
    color: "text-muted-foreground",
    bgColor: "bg-muted",
    countries: ["🇺🇸", "🇨🇦"]
  }
];

import { Activity } from "lucide-react";

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
        <p className="text-muted-foreground text-lg">North American basketball hierarchy from professional to youth levels.</p>
      </div>

      <div className="space-y-6">
        {LEAGUES.map((league) => (
          <div key={league.name}>
            <Card 
              className={`overflow-hidden border-border transition-all cursor-pointer hover:border-primary/50 ${expandedLeague === league.name ? 'border-primary shadow-lg ring-1 ring-primary/20' : ''}`}
              onClick={() => league.hasTeams && toggleLeague(league.name)}
            >
              <div className="flex flex-col md:flex-row items-center p-6 gap-6">
                <div className={`w-16 h-16 rounded-2xl ${league.bgColor} flex items-center justify-center ${league.color} flex-shrink-0 shadow-sm border border-border/50`}>
                  <league.icon className="w-8 h-8" />
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
                  <div className="text-xl flex gap-1">
                    {(league as any).countries?.map((flag: string) => (
                      <span key={flag}>{flag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* NBA Teams Sub-list */}
            {expandedLeague === "NBA" && league.name === "NBA" && (
              <div className="mt-4 space-y-6 animate-in fade-in slide-in-from-top-4 duration-300 px-2">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h3 className="font-display text-xl font-bold uppercase tracking-tight text-foreground">Select Team & Season</h3>
                  <div className="flex gap-2">
                    {["2023-24", "2020-21"].map((s) => (
                      <span key={s} className="text-[10px] font-mono bg-primary/10 text-primary px-2 py-0.5 rounded">
                        {s} Available
                      </span>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {NBA_TEAMS.map((team) => (
                    <div key={team.id} className="space-y-2">
                      <div className="text-[10px] font-mono text-primary uppercase tracking-widest px-1 truncate">{team.name}</div>
                      <div className="flex flex-col gap-1.5">
                        <Link href={`/roster/${encodeURIComponent(team.name)}/2023-24`}>
                          <Card className="p-2 hover-elevate border-border hover:border-primary/40 cursor-pointer bg-card/50 backdrop-blur-sm flex items-center justify-between group">
                            <span className="text-[11px] font-bold">2023-24</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Card>
                        </Link>
                        <Link href={`/roster/${encodeURIComponent(team.name)}/2020-21`}>
                          <Card className="p-2 hover-elevate border-border hover:border-primary/40 cursor-pointer bg-card/50 backdrop-blur-sm flex items-center justify-between group border-dashed">
                            <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground">2020-21</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                          </Card>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
