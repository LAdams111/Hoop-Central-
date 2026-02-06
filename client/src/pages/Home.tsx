import { Link } from "wouter";
import { ArrowRight, Search, Activity, Users, Trophy } from "lucide-react";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const { data: players, isLoading } = usePlayers();
  const { data: trendingPlayers, isLoading: isLoadingTrending } = usePlayers({ sortBy: "views" });
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/players?search=${encodeURIComponent(search)}`);
    }
  };

  // Get featured players (first 3 for now, ideally strictly featured ones)
  const featuredPlayers = players?.slice(0, 3) || [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-hidden border-b border-border/40">
        {/* Background Overlay */}
        <div className="absolute inset-0 bg-background z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black_70%,transparent_100%)]" />
        </div>

        <div className="container relative z-10 px-4 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-primary mb-6 animate-fade-in-up">
            <Activity className="w-3 h-3" />
            <span>REAL-TIME ANALYTICS</span>
          </div>
          
          <h1 className="font-display text-7xl md:text-9xl font-bold tracking-tighter text-white mb-6 animate-fade-in-up delay-100">
            HOOP<span className="text-primary text-glow">CENTRAL</span>
          </h1>
          
          <p className="font-body text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200">
            The ultimate database for modern basketball analytics. Track performance, analyze trends, and discover the next MVP.
          </p>

          <div className="max-w-md mx-auto relative group animate-fade-in-up delay-300">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input 
                className="pl-12 py-7 rounded-full bg-white/5 border-white/10 text-lg focus:border-primary/50 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50" 
                placeholder="Search player name..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="submit" className="absolute right-2 top-2 rounded-full h-10 w-10 p-0" variant="default">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="border-b border-border/40 bg-card/30 backdrop-blur-sm py-8">
        <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { label: "Active Players", value: "450+", icon: Users },
            { label: "Seasons Tracked", value: "75", icon: Trophy },
            { label: "Data Points", value: "1.2M", icon: Activity },
            { label: "Teams", value: "30", icon: Users },
          ].map((stat, i) => (
            <div key={i} className="flex items-center gap-4 justify-center md:justify-start group">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-[500px] rounded-xl bg-card/50 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {featuredPlayers.map((player) => (
                <div key={player.id} className="h-[500px]">
                  <PlayerCard player={player} />
                </div>
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
      <section className="py-24 bg-card/10 relative overflow-hidden border-t border-white/5">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-[500px] rounded-xl bg-card/50 animate-pulse border border-white/5" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {trendingPlayers
                ?.filter(p => !players?.slice(0, 3).some(fp => fp.id === p.id))
                .slice(0, 3)
                .map((player) => (
                  <div key={player.id} className="h-[500px]">
                    <PlayerCard player={player} />
                  </div>
                ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
