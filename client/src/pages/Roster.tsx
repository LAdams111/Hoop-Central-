import { useRoute, useLocation } from "wouter";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Calendar, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Player, TeamRecord } from "@shared/schema";
import { DEFAULT_HEADSHOT } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NBA_TEAM_IDS: Record<string, string> = {
  "Atlanta Hawks": "1610612737",
  "Boston Celtics": "1610612738",
  "Brooklyn Nets": "1610612751",
  "Charlotte Hornets": "1610612766",
  "Chicago Bulls": "1610612741",
  "Cleveland Cavaliers": "1610612739",
  "Dallas Mavericks": "1610612742",
  "Denver Nuggets": "1610612743",
  "Detroit Pistons": "1610612765",
  "Golden State Warriors": "1610612744",
  "Houston Rockets": "1610612745",
  "Indiana Pacers": "1610612754",
  "LA Clippers": "1610612746",
  "Los Angeles Clippers": "1610612746",
  "Los Angeles Lakers": "1610612747",
  "Memphis Grizzlies": "1610612763",
  "Miami Heat": "1610612748",
  "Milwaukee Bucks": "1610612749",
  "Minnesota Timberwolves": "1610612750",
  "New Orleans Pelicans": "1610612740",
  "New York Knicks": "1610612752",
  "Oklahoma City Thunder": "1610612760",
  "Orlando Magic": "1610612753",
  "Philadelphia 76ers": "1610612755",
  "Phoenix Suns": "1610612756",
  "Portland Trail Blazers": "1610612757",
  "Sacramento Kings": "1610612758",
  "San Antonio Spurs": "1610612759",
  "Toronto Raptors": "1610612761",
  "Utah Jazz": "1610612762",
  "Washington Wizards": "1610612764",
};

const G_LEAGUE_LOGOS: Record<string, string> = {
  "Austin Spurs": "https://upload.wikimedia.org/wikipedia/en/6/6c/Austin_Spurs_logo.svg",
  "Birmingham Squadron": "https://upload.wikimedia.org/wikipedia/en/1/15/Birmingham_Squadron_logo.svg",
  "Capital City Go-Go": "https://upload.wikimedia.org/wikipedia/en/8/87/Capital_City_Go-Go_logo.svg",
  "Cleveland Charge": "https://upload.wikimedia.org/wikipedia/en/b/be/Cleveland_Charge_logo.svg",
  "College Park Skyhawks": "https://upload.wikimedia.org/wikipedia/en/4/44/College_Park_Skyhawks_logo.svg",
  "Delaware Blue Coats": "https://upload.wikimedia.org/wikipedia/en/6/62/Delaware_Blue_Coats_logo.svg",
  "Grand Rapids Gold": "https://upload.wikimedia.org/wikipedia/en/8/84/Grand_Rapids_Gold_logo.svg",
  "Greensboro Swarm": "https://upload.wikimedia.org/wikipedia/en/e/e1/Greensboro_Swarm_logo.svg",
  "Iowa Wolves": "https://upload.wikimedia.org/wikipedia/en/b/b5/Iowa_Wolves_logo.svg",
  "Long Island Nets": "https://upload.wikimedia.org/wikipedia/en/f/f0/Long_Island_Nets_logo.svg",
  "Maine Celtics": "https://upload.wikimedia.org/wikipedia/en/6/65/Maine_Celtics_logo.svg",
  "Memphis Hustle": "https://upload.wikimedia.org/wikipedia/en/a/a8/Memphis_Hustle_logo.svg",
  "Mexico City Capitanes": "https://upload.wikimedia.org/wikipedia/en/e/e6/Capitanes_Ciudad_de_M%C3%A9xico_logo.svg",
  "Motor City Cruise": "https://upload.wikimedia.org/wikipedia/en/5/51/Motor_City_Cruise_logo.svg",
  "Oklahoma City Blue": "https://upload.wikimedia.org/wikipedia/en/d/d6/Oklahoma_City_Blue_logo.svg",
  "Osceola Magic": "https://upload.wikimedia.org/wikipedia/en/9/9a/Osceola_Magic_Logo.svg",
  "Raptors 905": "https://upload.wikimedia.org/wikipedia/en/4/4b/Raptors_905_logo.svg",
  "Rip City Remix": "https://upload.wikimedia.org/wikipedia/en/1/17/Rip_City_Remix_logo.svg",
  "Salt Lake City Stars": "https://upload.wikimedia.org/wikipedia/en/3/37/Salt_Lake_City_Stars_logo.svg",
  "San Diego Clippers": "https://upload.wikimedia.org/wikipedia/en/a/ac/Ontario_Clippers_logo.svg",
  "Santa Cruz Warriors": "https://upload.wikimedia.org/wikipedia/en/6/64/Santa_Cruz_Warriors_logo.svg",
  "Sioux Falls Skyforce": "https://upload.wikimedia.org/wikipedia/en/9/98/Sioux_Falls_Skyforce_logo.svg",
  "South Bay Lakers": "https://upload.wikimedia.org/wikipedia/en/9/90/South_Bay_Lakers_logo.svg",
  "Stockton Kings": "https://upload.wikimedia.org/wikipedia/en/d/d9/Stockton_Kings_logo.svg",
  "Texas Legends": "https://upload.wikimedia.org/wikipedia/en/c/c8/Texas_Legends_logo.svg",
  "Westchester Knicks": "https://upload.wikimedia.org/wikipedia/en/5/50/Westchester_Knicks_logo.svg",
  "Windy City Bulls": "https://upload.wikimedia.org/wikipedia/en/e/e5/Windy_City_Bulls_logo.svg",
  "Wisconsin Herd": "https://upload.wikimedia.org/wikipedia/en/e/e0/Wisconsin_Herd_logo.svg",
};

function getTeamLogoUrl(teamName: string): string | null {
  const teamId = NBA_TEAM_IDS[teamName];
  if (teamId) {
    return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
  }
  if (G_LEAGUE_LOGOS[teamName]) {
    return G_LEAGUE_LOGOS[teamName];
  }
  return null;
}

const AVAILABLE_SEASONS = ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21", "2018-19", "1997-98", "1995-96", "1992-93", "1987-88"];

/** Normalize season to YYYY-YY format (e.g. "1999" → "1998-99"). */
function normalizeSeasonFormat(season: string): string {
  const s = season.trim();
  if (/^\d{4}$/.test(s)) {
    const y = parseInt(s, 10);
    return `${y - 1}-${String(y).slice(-2)}`;
  }
  return s;
}

export default function Roster() {
  const [, params] = useRoute("/roster/:team/:season");
  const [, setLocation] = useLocation();
  const team = decodeURIComponent(params?.team || "");
  const seasonFromUrl = decodeURIComponent(params?.season || "");
  const season = normalizeSeasonFormat(seasonFromUrl);

  useEffect(() => {
    if (seasonFromUrl && season !== seasonFromUrl) {
      setLocation(`/roster/${encodeURIComponent(team)}/${encodeURIComponent(season)}`);
    }
  }, [seasonFromUrl, season, team, setLocation]);

  const { data: rosterPlayers, isLoading } = useQuery<Player[]>({
    queryKey: ['/api/teams', team, 'roster', season],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${encodeURIComponent(team)}/roster/${encodeURIComponent(season)}`);
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
    enabled: !!team && !!season,
  });

  const { data: teamRecord } = useQuery<TeamRecord | null>({
    queryKey: ['/api/teams', team, 'record', season],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${encodeURIComponent(team)}/record/${encodeURIComponent(season)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!team && !!season,
  });

  const handleSeasonChange = (newSeason: string) => {
    setLocation(`/roster/${encodeURIComponent(team)}/${encodeURIComponent(newSeason)}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const players = rosterPlayers || [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-muted border-b border-border py-12">
        <div className="container mx-auto px-4">
          <Button variant="outline" size="sm" className="rounded-full mb-8" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="flex items-center gap-6">
              {getTeamLogoUrl(team) ? (
                <div className="w-20 h-20 flex items-center justify-center flex-shrink-0">
                  <img
                    src={getTeamLogoUrl(team)!}
                    alt={`${team} logo`}
                    className="max-w-full max-h-full object-contain"
                    data-testid="img-team-logo"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-10 h-10" />
                </div>
              )}
              <div>
                <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tighter uppercase" data-testid="text-team-name">
                  {team}
                </h1>
                <p className="font-mono text-xl text-muted-foreground uppercase tracking-widest">
                  Team Roster
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 min-w-[200px]">
              <div className="flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                <Calendar className="w-3 h-3" />
                <span>Select Season</span>
              </div>
              <Select value={season} onValueChange={handleSeasonChange}>
                <SelectTrigger className="w-full bg-background border-2 border-border h-12 rounded-xl text-lg font-mono" data-testid="select-season">
                  <SelectValue placeholder="Choose Season" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_SEASONS.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono" data-testid={`option-season-${s}`}>
                      {s} Season
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        <div className="flex items-center justify-between gap-3 mb-8 border-b border-border pb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight" data-testid="text-season-heading">{season} Season Roster</h2>
            {players.length > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">{players.length} Active</Badge>
            )}
          </div>
          {teamRecord && (
            <div className="flex items-center gap-3" data-testid="team-record">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="font-display text-2xl font-bold tracking-tight">
                <span className="text-primary">{teamRecord.wins}</span>
                <span className="text-muted-foreground mx-1">-</span>
                <span className="text-muted-foreground">{teamRecord.losses}</span>
              </span>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">W-L</span>
            </div>
          )}
        </div>

        {players.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-8" data-testid="roster-players-grid">
            {players.map((player) => (
              <Link key={player.id} href={`/players/${(player as { player_id?: string }).player_id ?? player.id}`} className="group" data-testid={`link-player-${player.id}`}>
                <div className="flex flex-col items-center gap-4 p-6 rounded-3xl hover:bg-muted transition-all duration-300 border border-transparent hover:border-border">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-105 shadow-md">
                    <img 
                      src={player.headshotUrl || DEFAULT_HEADSHOT} 
                      alt={player.name}
                      className="w-full h-full object-cover object-top"
                      data-testid={`img-player-${player.id}`}
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl font-display font-bold text-center uppercase leading-none group-hover:text-primary transition-colors" data-testid={`text-player-name-${player.id}`}>
                      {player.name}
                    </span>
                    <span className="text-2xl font-display font-bold text-primary" data-testid={`text-player-jersey-${player.id}`}>
                      #{player.jerseyNumber}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-1">
                      View Profile
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-6" data-testid="empty-roster-state">
            <div className="space-y-2">
              <p className="text-muted-foreground font-display text-2xl uppercase">No players found for this season</p>
              <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Select a different season above</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
