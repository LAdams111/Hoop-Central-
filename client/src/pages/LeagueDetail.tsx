import { useRoute } from "wouter";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Link } from "wouter";
import { NBA_TEAMS, G_LEAGUE_TEAMS } from "@/lib/constants";

const LEAGUE_INFO: Record<string, { display: string; tier: string; description: string; logoUrl?: string; apiKey?: string; defaultSeason: string }> = {
  "NBA": {
    display: "NBA",
    tier: "Tier 1: Professional",
    description: "The National Basketball Association - the premier professional basketball league in the world.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/0/03/National_Basketball_Association_logo.svg",
    defaultSeason: "2023-24",
  },
  "G-League": {
    display: "NBA G League",
    tier: "Tier 2: Professional",
    description: "The official minor league organization of the NBA.",
    logoUrl: "https://cdn.nba.com/logos/leagues/logo-gleague.svg",
    defaultSeason: "2023-24",
  },
  "NCAA": {
    display: "NCAA Division I",
    tier: "Tier 3: Collegiate",
    description: "The highest level of intercollegiate athletics sanctioned by the NCAA.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/commons/d/dd/NCAA_logo.svg",
    apiKey: "NCAA",
    defaultSeason: "2024-25",
  },
  "OTE": {
    display: "Overtime Elite (OTE)",
    tier: "Tier 4: Professional",
    description: "A professional basketball league for late-stage high school and early college-level players.",
    apiKey: "OTE",
    defaultSeason: "2023-24",
  },
  "High-School": {
    display: "High School",
    tier: "Tier 5: Amateur",
    description: "Varsity high school basketball programs across the country producing top collegiate and professional talent.",
    apiKey: "HS",
    defaultSeason: "2023-24",
  },
  "AAU": {
    display: "AAU",
    tier: "Tier 5: Amateur",
    description: "The Amateur Athletic Union organizes competitive club basketball for youth and high school players nationwide.",
    logoUrl: "https://upload.wikimedia.org/wikipedia/en/f/f6/Amateur_Athletic_Union_%28logo%29.png",
    apiKey: "AAU",
    defaultSeason: "2023-24",
  },
};

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:league");
  const leagueSlug = params?.league || "";
  const info = LEAGUE_INFO[leagueSlug];

  const isDynamic = !!info?.apiKey;
  const [teamSearch, setTeamSearch] = useState("");

  const { data: dynamicTeams, isLoading } = useQuery<{ team: string; season: string }[]>({
    queryKey: ['/api/leagues', info?.apiKey, 'teams'],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${encodeURIComponent(info!.apiKey!)}/teams`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: isDynamic,
  });

  if (!info) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">League not found</p>
      </div>
    );
  }

  let staticTeams: { name: string; season: string }[] = [];
  if (leagueSlug === "NBA") {
    staticTeams = NBA_TEAMS.map(t => ({ name: t, season: info.defaultSeason }));
  } else if (leagueSlug === "G-League") {
    staticTeams = G_LEAGUE_TEAMS.map(t => ({ name: t, season: info.defaultSeason }));
  }

  const groupedDynamic = dynamicTeams
    ? Object.entries(
        dynamicTeams.reduce<Record<string, string[]>>((acc, { team, season }) => {
          if (!acc[team]) acc[team] = [];
          acc[team].push(season);
          return acc;
        }, {})
      )
        .map(([team, seasons]) => ({
          name: team,
          season: seasons.sort().reverse()[0],
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  const allTeams = isDynamic ? groupedDynamic : staticTeams;
  const teams = allTeams.filter(t => {
    if (teamSearch.length === 0) return true;
    const searchWords = teamSearch.toLowerCase().trim().split(/\s+/);
    const nameWords = t.name.toLowerCase().split(' ');
    return searchWords.every(sw => nameWords.some(nw => nw.startsWith(sw)));
  });
  const accentClass = leagueSlug === "G-League" ? "text-accent" : "text-primary";
  const arrowAccent = leagueSlug === "G-League" ? "text-accent" : "text-primary";

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-muted border-b border-border py-12">
        <div className="container mx-auto px-4">
          <Button variant="outline" size="sm" className="rounded-full mb-8" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-24 h-24 flex items-center justify-center flex-shrink-0">
              {info.logoUrl ? (
                <img src={info.logoUrl} alt={info.display} className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display text-3xl font-bold">
                  {info.display.charAt(0)}
                </div>
              )}
            </div>
            <div className="text-center md:text-left">
              <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">{info.tier}</div>
              <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tighter uppercase" data-testid="text-league-name">
                {info.display}
              </h1>
              <p className="text-muted-foreground text-sm max-w-2xl mt-2">{info.description}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 border-b border-border pb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight" data-testid="text-teams-heading">Teams</h2>
            {allTeams.length > 0 && (
              <span className="text-sm font-mono text-muted-foreground">{teams.length} of {allTeams.length}</span>
            )}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search teams..."
              className="pl-10 bg-card/50 border-border"
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              data-testid="input-search-teams"
            />
          </div>
        </div>

        {isDynamic && isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : teams.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" data-testid="teams-grid">
            {teams.map((team) => (
              <Link key={team.name} href={`/roster/${encodeURIComponent(team.name)}/${encodeURIComponent(team.season)}`} data-testid={`link-team-${team.name.replace(/\s+/g, '-').toLowerCase()}`}>
                <Card className="p-3 hover-elevate border-border hover:border-primary/40 cursor-pointer bg-card/50 backdrop-blur-sm">
                  <div className={`text-[10px] font-mono uppercase tracking-widest mb-1 truncate ${accentClass}`}>{info.display}</div>
                  <div className="text-sm font-bold truncate">{team.name}</div>
                  <div className="flex items-center justify-between gap-1 mt-2">
                    <span className="text-[9px] text-muted-foreground font-mono">{team.season}</span>
                    <ArrowRight className={`w-3 h-3 ${arrowAccent}`} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-6" data-testid="empty-teams-state">
            <p className="text-muted-foreground font-display text-2xl uppercase">No teams found in this league yet</p>
            <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Teams will appear here as players are added</p>
          </div>
        )}
      </div>
    </div>
  );
}
