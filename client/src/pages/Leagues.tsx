import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Star, School, Medal, ArrowRight, ChevronRight, ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

const NBA_TEAMS = [
  { name: "Atlanta Hawks", id: "ATL" },
  { name: "Boston Celtics", id: "BOS" },
  { name: "Brooklyn Nets", id: "BKN" },
  { name: "Charlotte Hornets", id: "CHA" },
  { name: "Chicago Bulls", id: "CHI" },
  { name: "Cleveland Cavaliers", id: "CLE" },
  { name: "Dallas Mavericks", id: "DAL" },
  { name: "Denver Nuggets", id: "DEN" },
  { name: "Detroit Pistons", id: "DET" },
  { name: "Golden State Warriors", id: "GSW" },
  { name: "Houston Rockets", id: "HOU" },
  { name: "Indiana Pacers", id: "IND" },
  { name: "LA Clippers", id: "LAC" },
  { name: "Los Angeles Lakers", id: "LAL" },
  { name: "Memphis Grizzlies", id: "MEM" },
  { name: "Miami Heat", id: "MIA" },
  { name: "Milwaukee Bucks", id: "MIL" },
  { name: "Minnesota Timberwolves", id: "MIN" },
  { name: "New Orleans Pelicans", id: "NOP" },
  { name: "New York Knicks", id: "NYK" },
  { name: "Oklahoma City Thunder", id: "OKC" },
  { name: "Orlando Magic", id: "ORL" },
  { name: "Philadelphia 76ers", id: "PHI" },
  { name: "Phoenix Suns", id: "PHX" },
  { name: "Portland Trail Blazers", id: "POR" },
  { name: "Sacramento Kings", id: "SAC" },
  { name: "San Antonio Spurs", id: "SAS" },
  { name: "Toronto Raptors", id: "TOR" },
  { name: "Utah Jazz", id: "UTA" },
  { name: "Washington Wizards", id: "WAS" },
];

const LEAGUES = [
  {
    name: "NBA",
    tier: "Tier 1: Professional (Top)",
    description: "The National Basketball Association - the premier professional basketball league in the world.",
    icon: Trophy,
    color: "text-primary",
    bgColor: "bg-primary/10",
    hasTeams: true
  },
  {
    name: "NBA G League",
    tier: "Tier 2: Professional (Developmental)",
    description: "The official minor league organization of the NBA.",
    icon: Activity,
    color: "text-accent",
    bgColor: "bg-accent/10"
  },
  {
    name: "NCAA Division I",
    tier: "Tier 3: Collegiate",
    description: "The highest level of intercollegiate athletics sanctioned by the NCAA.",
    icon: School,
    color: "text-blue-600",
    bgColor: "bg-blue-50"
  },
  {
    name: "Overtime Elite (OTE)",
    tier: "Tier 4: Professional / Youth",
    description: "A professional basketball league for late-stage high school and early college-level players.",
    icon: Star,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50"
  },
  {
    name: "High School / AAU",
    tier: "Tier 5: Amateur / Youth",
    description: "Premier competitive circuit for high school athletes and independent club teams.",
    icon: Users,
    color: "text-muted-foreground",
    bgColor: "bg-muted"
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
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Status</div>
                  <div className="text-sm font-mono text-foreground">Active Circuit</div>
                </div>
              </div>
            </Card>

            {/* NBA Teams Sub-list */}
            {expandedLeague === "NBA" && league.name === "NBA" && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 animate-in fade-in slide-in-from-top-4 duration-300 px-2">
                {NBA_TEAMS.map((team) => (
                  <Link key={team.id} href={`/roster/${team.id}/2023-24`}>
                    <Card className="p-3 hover-elevate border-border hover:border-primary/40 cursor-pointer bg-card/50 backdrop-blur-sm">
                      <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-1">{team.id}</div>
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
          </div>
        ))}
      </div>
    </div>
  );
}
