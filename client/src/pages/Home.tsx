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

  // Get featured players (excluding Jalen Green)
  const featuredPlayers = players?.filter(p => p.name !== "Jalen Green").slice(0, 3) || [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative h-[85vh] flex items-center justify-center overflow-hidden border-b border-border/20">
        {/* Background Overlay */}
        <div className="absolute inset-0 bg-background z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
          {/* Subtle grid pattern */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black_70%,transparent_100%)]" />
        </div>

        <div className="container relative z-10 px-4 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-mono font-bold text-primary mb-8 animate-fade-in-up shadow-sm">
            <Activity className="w-3.5 h-3.5" />
            <span className="tracking-[0.2em] uppercase">Advanced Analytics Platform</span>
          </div>
          
          <h1 className="font-display text-8xl md:text-[10rem] font-bold tracking-tighter text-foreground mb-8 animate-fade-in-up delay-100 leading-[0.85]">
            <span className="relative inline-block mr-2">
              HOOP
              <span className="absolute -inset-1 blur-2xl bg-primary/20 -z-10 rounded-full"></span>
            </span>
            <span className="text-primary text-glow italic">CENTRAL</span>
          </h1>
          
          <p className="font-body text-xl md:text-2xl text-muted-foreground/80 max-w-2xl mx-auto mb-12 animate-fade-in-up delay-200 leading-relaxed">
            The premium database for elite basketball statistics. Track global performance with precision-engineered analytics.
          </p>

          <div className="max-w-xl mx-auto relative group animate-fade-in-up delay-300">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground group-focus-within:text-primary transition-all duration-300" />
              <Input 
                className="pl-16 pr-20 py-8 rounded-2xl bg-white/50 backdrop-blur-md border-border/50 text-xl focus:border-primary/50 focus:ring-primary/10 transition-all placeholder:text-muted-foreground/40 border-2 shadow-2xl shadow-primary/5" 
                placeholder="Search athlete by name..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Button type="submit" className="absolute right-3 top-3 rounded-xl h-10 w-10 p-0 shadow-lg shadow-primary/20" variant="default">
                <ArrowRight className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      {/* STATS STRIP */}
      <section className="border-b border-border/20 bg-white/30 backdrop-blur-xl py-12">
        <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-12">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-[500px] rounded-xl bg-card/50 animate-pulse border border-border" />
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
