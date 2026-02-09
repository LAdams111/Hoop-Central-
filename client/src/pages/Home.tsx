import { Link } from "wouter";
import { ArrowRight, Search, Activity, Users, Trophy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { DEFAULT_HEADSHOT } from "@/lib/constants";

export default function Home() {
  const { data: players, isLoading } = usePlayers();
  const { data: trendingPlayers, isLoading: isLoadingTrending } = usePlayers({ sortBy: "views" });
  const { data: teamCountData } = useQuery<{ count: number }>({ queryKey: ['/api/teams/count'] });
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/players?search=${encodeURIComponent(search)}`);
      setShowSuggestions(false);
    }
  };

  const suggestions = players
    ?.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) && search.length > 0)
    .slice(0, 5) || [];

  // Get featured players (excluding Jalen Green)
  const featuredPlayers = players?.filter(p => p.name !== "Jalen Green").slice(0, 5) || [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden border-b border-border/40 z-20">
        {/* Background Overlay */}
        <div className="absolute inset-0 bg-background z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black_70%,transparent_100%)]" />
        </div>

        <div className="container relative z-10 px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-primary mb-6 animate-fade-in-up">
            <Activity className="w-3 h-3" />
            <span>REAL-TIME STATS</span>
          </div>
          
          <h1 className="font-display text-7xl md:text-9xl font-bold tracking-tighter text-foreground mb-6 animate-fade-in-up delay-100">
            <span style={{ 
              color: 'black',
              textShadow: '-2px -2px 0 #fff, 2px -2px 0 #fff, -2px 2px 0 #fff, 2px 2px 0 #fff, -2px 0 0 #fff, 2px 0 0 #fff, 0 -2px 0 #fff, 0 2px 0 #fff'
            }}>HOOP</span><span className="text-primary text-glow">CENTRAL</span>
          </h1>
          
          <p className="font-body text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200">
            The ultimate database for modern basketball stats. Track performance of the biggest stars and hottest prospects.
          </p>

          <div className="max-w-md mx-auto relative group animate-fade-in-up delay-300 z-[100]">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                className="pl-12 py-7 rounded-full bg-white/5 border-black text-lg focus:border-primary/50 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50 border-2" 
                placeholder="Search player name..." 
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
              />
              <Button type="submit" className="absolute right-2 top-2 rounded-full h-10 w-10 p-0" variant="default">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            {/* Suggestions Pop-up */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="py-2">
                  {suggestions.map((player) => (
                    <button
                      key={player.id}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors group"
                      onClick={() => {
                        setLocation(`/players/${player.id}`);
                        setShowSuggestions(false);
                      }}
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-border">
                        <img 
                          src={player.headshotUrl || DEFAULT_HEADSHOT} 
                          alt={player.name}
                          className="w-full h-full object-cover object-top"
                          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                        />
                      </div>
                      <div className="flex-1">
                        <div className="font-display font-bold text-foreground group-hover:text-primary transition-colors">
                          {player.name}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono uppercase">
                          {player.team} • #{player.jerseyNumber}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Click away listener */}
            {showSuggestions && (
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowSuggestions(false)}
              />
            )}
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
    <section className="border-b border-border/40 bg-card/30 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Active Players", value: `${players?.length || 0}+`, icon: Users },
            { label: "Active Scouts", value: "1.2k", icon: Search },
            { label: "Seasons Tracked", value: "75", icon: Trophy },
            { label: "Teams", value: `${teamCountData?.count || 0}+`, icon: Users },
          ].map((stat, i) => (
            <div key={i} className="flex items-center gap-4 justify-center group">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                <stat.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="font-display text-3xl font-bold">{stat.value}</div>
                <div className="text-xs font-mono text-muted-foreground uppercase tracking-widest">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURED PLAYERS */}
      <section className="py-24 bg-background relative overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl md:text-5xl text-foreground mb-2">Featured <span className="text-primary">Athletes</span></h2>
              <p className="text-muted-foreground">Top performers from the current season</p>
            </div>
            <Link href="/players">
              <Button variant="outline" className="hidden md:flex gap-2">
                View All Players
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-6 md:gap-8">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="aspect-[3/4] rounded-xl bg-card/50 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-6 md:gap-8">
              {featuredPlayers.map((player) => (
                <PlayerCard key={player.id} player={player} />
              ))}
            </div>
          )}
          
          <div className="mt-12 text-center md:hidden">
            <Link href="/players">
              <Button variant="outline" className="w-full">View Directory</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* TRENDING SECTION */}
      <section className="py-24 bg-muted relative overflow-hidden border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-4xl md:text-5xl text-foreground mb-2">Most <span className="text-primary text-glow">Viewed</span></h2>
              <p className="text-muted-foreground">Trending athletes this week</p>
            </div>
            <Link href="/players">
              <Button variant="ghost" className="hidden md:flex gap-2">
                Explore Trends
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>

          {isLoadingTrending ? (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-6 md:gap-8">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="aspect-[3/4] rounded-xl bg-card/50 animate-pulse border border-border" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-6 md:gap-8">
              {trendingPlayers
                ?.slice(0, 5)
                .map((player) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
            </div>
          )}
        </div>
      </section>

      {/* FAVORITES SECTION */}
      <FavoritesBar players={players} />
    </div>
  );
}

function FavoritesBar({ players }: { players: any[] | undefined }) {
  const [favIds, setFavIds] = useState<number[]>([]);
  const [favTeams, setFavTeams] = useState<string[]>([]);

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem('player_favorites') || '[]');
    const teamFavorites = JSON.parse(localStorage.getItem('team_favorites') || '[]');
    setFavIds(favorites);
    setFavTeams(teamFavorites);
  }, []);

  const favoritePlayers = players?.filter(p => favIds.includes(p.id)) || [];

  return (
    <section className="py-4 bg-background border-y border-border overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-6 overflow-x-auto pb-2 no-scrollbar">
          <div className="flex-shrink-0 flex items-center gap-2 pr-6 border-r border-border">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="font-display text-xl font-bold uppercase tracking-tight">Favorites</span>
          </div>
          <div className="flex items-center gap-4">
            {favTeams.map((teamName) => (
              <Link key={teamName} href={`/players?team=${encodeURIComponent(teamName)}`} className="group relative">
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-110 shadow-sm bg-white flex items-center justify-center p-1.5">
                  <img 
                    src={`https://cdn.nba.com/logos/nba/${TEAM_LOGOS[teamName] || '1610612737'}/global/L/logo.svg`}
                    alt={teamName}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            ))}
            {favoritePlayers.length > 0 || favTeams.length > 0 ? (
              favoritePlayers.map((player) => (
                <Link key={player.id} href={`/players/${player.id}`} className="group relative">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-110 shadow-sm">
                    <img 
                      src={player.headshotUrl || DEFAULT_HEADSHOT} 
                      alt={player.name}
                      className="w-full h-full object-cover object-top"
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-background opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              ))
            ) : (
              <div className="flex items-center -space-x-4 opacity-40">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="w-10 h-10 rounded-full border-2 border-border bg-muted/50 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                ))}
              </div>
            )}
            <Link href="/players" className="w-10 h-10 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-primary hover:text-primary transition-all group">
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const TEAM_LOGOS: Record<string, string> = {
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
  "Washington Wizards": "1610612764"
};
