import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Flag, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Player } from "@shared/schema";
import { useState, useEffect } from "react";
import { EUROLEAGUE_LOGOS, WNBA_LOGOS } from "@/lib/constants";

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
  if (WNBA_LOGOS[teamName]) {
    return WNBA_LOGOS[teamName];
  }
  if (G_LEAGUE_LOGOS[teamName]) {
    return G_LEAGUE_LOGOS[teamName];
  }
  if (EUROLEAGUE_LOGOS[teamName]) {
    return EUROLEAGUE_LOGOS[teamName];
  }
  return null;
}

export default function TeamRoster() {
  const [, params] = useRoute("/roster/:team/:season");
  const team = params?.team || "";
  const season = params?.season || "";
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (!team) return;
    const favorites = JSON.parse(localStorage.getItem('team_favorites') || '[]');
    setIsFavorited(favorites.includes(team));
  }, [team]);

  const toggleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem('team_favorites') || '[]');
    let newFavorites;
    if (favorites.includes(team)) {
      newFavorites = favorites.filter((favName: string) => favName !== team);
    } else {
      newFavorites = [...favorites, team];
    }
    localStorage.setItem('team_favorites', JSON.stringify(newFavorites));
    setIsFavorited(!isFavorited);
  };

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: [`/api/teams/${encodeURIComponent(team)}/roster/${season}`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-12 pb-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="mb-12">
          <Link href="/players">
            <Button variant="ghost" className="mb-4 -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Directory
            </Button>
          </Link>
          <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="font-display text-xl font-bold uppercase tracking-tight text-foreground">Favorite Team</span>
            </div>
            <Button 
              variant={isFavorited ? "default" : "secondary"}
              size="sm"
              className={`flex items-center gap-2 rounded-lg border ${isFavorited ? 'border-primary' : 'border-border'} transition-all`}
              onClick={toggleFavorite}
              data-testid="button-favorite-team"
            >
              <Flag className={`w-4 h-4 ${isFavorited ? 'fill-current' : ''}`} />
              <span className="font-display font-bold uppercase tracking-tight">{isFavorited ? 'Favorited' : 'Favorite'}</span>
            </Button>
          </div>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              {getTeamLogoUrl(team) ? (
                <div className="w-16 h-16 flex items-center justify-center flex-shrink-0">
                  <img
                    src={getTeamLogoUrl(team)!}
                    alt={`${team} logo`}
                    className="max-w-full max-h-full object-contain"
                    data-testid="img-team-logo"
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                  <Users className="w-8 h-8" />
                </div>
              )}
              <div>
                <h1 className="text-4xl md:text-6xl font-display text-foreground uppercase tracking-tighter">
                  {team} <span className="text-primary">Roster</span>
                </h1>
                <p className="text-muted-foreground font-mono">{season} Season</p>
              </div>
            </div>
          </div>
        </div>

        {!players || players.length === 0 ? (
          <div className="text-center py-24 bg-card/30 rounded-3xl border border-dashed border-white/10">
            <h3 className="font-display text-2xl text-muted-foreground">No roster data available</h3>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {[...players].sort((a, b) => {
              return (a.jerseyNumber || 0) - (b.jerseyNumber || 0);
            }).map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
