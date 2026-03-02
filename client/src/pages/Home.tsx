import { Link } from "wouter";
import { ArrowRight, Search, Activity, Users, Trophy, Lock, X, Plus, Minus, LogOut } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { DEFAULT_HEADSHOT, NBA_TEAMS, G_LEAGUE_TEAMS, LEAGUE_DEFAULT_SEASONS } from "@/lib/constants";
import { getPlayerFavorites } from "@/lib/favorites";
import { queryClient } from "@/lib/queryClient";
import type { Player } from "@shared/schema";

export default function Home() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: players, isLoading } = usePlayers();
  const { data: searchResults } = usePlayers(
    debouncedSearch.trim() ? { search: debouncedSearch.trim() } : undefined
  );
  const { data: trendingPlayers, isLoading: isLoadingTrending } = usePlayers({ sortBy: "views" });
  const { data: featuredPlayers, isLoading: isLoadingFeatured } = useQuery<Player[]>({ queryKey: ["/api/featured-players"] });
  const { data: teamCountData } = useQuery<{ count: number }>({ queryKey: ["/api/teams/count"] });
  const { data: playersCountData } = useQuery<{ count: number }>({ queryKey: ["/api/players/count"] });
  const { data: dbTeams } = useQuery<{ team: string; league: string; season: string }[]>({ queryKey: ["/api/teams/all"] });

  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [showFeaturedPicker, setShowFeaturedPicker] = useState(false);
  const [featuredSearch, setFeaturedSearch] = useState("");
  const [debouncedFeaturedSearch, setDebouncedFeaturedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedFeaturedSearch(featuredSearch), 300);
    return () => clearTimeout(t);
  }, [featuredSearch]);

  const { data: featuredIds } = useQuery<number[]>({ queryKey: ["/api/featured-player-ids"] });
  const { data: featuredSearchResults, isLoading: isLoadingFeaturedSearch } = usePlayers(
    debouncedFeaturedSearch.trim() ? { search: debouncedFeaturedSearch.trim() } : undefined
  );

  const featuredMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/featured-players", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error("Failed to update featured players");
    },
    onMutate: async (newIds) => {
      await queryClient.cancelQueries({ queryKey: ["/api/featured-player-ids"] });
      await queryClient.cancelQueries({ queryKey: ["/api/featured-players"] });
      const prevIds = queryClient.getQueryData<number[]>(["/api/featured-player-ids"]);
      const prevPlayers = queryClient.getQueryData<Player[]>(["/api/featured-players"]);
      queryClient.setQueryData(["/api/featured-player-ids"], newIds);
      if (prevPlayers && prevIds) {
        const keepSet = new Set(newIds);
        const nextPlayers = prevPlayers.filter((p) => keepSet.has(Number(p.id)));
        queryClient.setQueryData(["/api/featured-players"], nextPlayers);
      }
      return { prevIds, prevPlayers };
    },
    onError: (_err, _newIds, context) => {
      if (context?.prevIds != null) queryClient.setQueryData(["/api/featured-player-ids"], context.prevIds);
      if (context?.prevPlayers != null) queryClient.setQueryData(["/api/featured-players"], context.prevPlayers);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/featured-players"] });
      queryClient.invalidateQueries({ queryKey: ["/api/featured-player-ids"] });
    },
  });

  const hasSavedFeatured = (featuredPlayers?.length ?? 0) > 0;

  /** Remove a player from featured only (used by X on featured cards). */
  const removeFromFeatured = (playerId: number | string) => {
    const numId = Number(playerId);
    if (Number.isNaN(numId)) return;
    const current = featuredIds || [];
    if (!current.includes(numId)) return;
    const newIds = current.filter((id) => id !== numId).map((id) => Number(id));
    featuredMutation.mutate(newIds);
  };

  const toggleFeatured = (playerId: number | string) => {
    const numId = Number(playerId);
    if (Number.isNaN(numId)) return;
    const current = featuredIds || [];
    const newIds = current.includes(numId)
      ? current.filter((id) => id !== numId)
      : current.length >= 10 ? current : [...current, numId];
    featuredMutation.mutate(newIds.map((id) => Number(id)));
  };

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => { if (d.authenticated) setIsAdmin(true); else localStorage.removeItem("admin_token"); })
        .catch(() => localStorage.removeItem("admin_token"));
    }
  }, []);

  const handleAdminLogin = async () => {
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem("admin_token", adminPassword);
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminPassword("");
        setAdminError("");
      } else {
        setAdminError(data.error || "Login failed");
      }
    } catch { setAdminError("Login failed"); }
  };

  const handleAdminLogout = () => {
    localStorage.removeItem("admin_token");
    setIsAdmin(false);
  };

  const LEAGUE_TIER: Record<string, number> = {
    "NBA": 1, "G-League": 2, "NCAA": 3, "OTE": 4, "HS": 5, "AAU": 5,
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setLocation(`/players?search=${encodeURIComponent(search)}`);
      setShowSuggestions(false);
    }
  };

  const allTeams = (() => {
    const teamMap = new Map<string, { name: string; league: string; season: string }>();
    NBA_TEAMS.forEach(name => teamMap.set(name, { name, league: "NBA", season: "2025-26" }));
    G_LEAGUE_TEAMS.forEach(name => teamMap.set(name, { name, league: "G-League", season: "2025-26" }));
    dbTeams?.forEach(t => {
      if (!teamMap.has(t.team)) {
        teamMap.set(t.team, { name: t.team, league: t.league, season: t.season });
      }
    });
    return Array.from(teamMap.values());
  })();

  const matchesSearch = (name: string) => {
    if (search.length === 0) return false;
    const searchWords = search.toLowerCase().trim().split(/\s+/);
    const nameWords = name.toLowerCase().split(' ');
    return searchWords.every(sw => nameWords.some(nw => nw.startsWith(sw)));
  };

  const teamSuggestions = allTeams
    .filter(t => matchesSearch(t.name))
    .sort((a, b) => (LEAGUE_TIER[a.league] || 99) - (LEAGUE_TIER[b.league] || 99))
    .slice(0, 5);

  const playerSuggestions = (search.trim()
    ? (searchResults ?? [])
    : (players ?? []).filter(p => matchesSearch(p.name))
  ).slice(0, 5);

  const combined = [
    ...playerSuggestions.map(p => ({ type: "player" as const, data: p })),
    ...teamSuggestions.map(t => ({ type: "team" as const, data: t })),
  ].slice(0, 5);

  const hasSuggestions = combined.length > 0;

  const displayFeatured =
    hasSavedFeatured ? featuredPlayers! : players?.slice(0, 5) || [];

  const featuredPickerResults =
    featuredSearch.trim().length > 0
      ? (featuredSearchResults ?? []).slice(0, 8)
      : [];

  return (
    <div className="flex flex-col min-h-screen">
      {/* HERO SECTION */}
      <section className="relative h-[80vh] flex items-center justify-center overflow-visible border-b border-border/40 z-20">
        <div className="absolute inset-0 bg-background z-0">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-background to-background" />
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
                placeholder="Search players or teams..." 
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                data-testid="input-hero-search"
              />
              <Button type="submit" className="absolute right-2 top-2 rounded-full h-10 w-10 p-0" variant="default" data-testid="button-hero-search-submit">
                <ArrowRight className="w-4 h-4" />
              </Button>
            </form>

            {showSuggestions && hasSuggestions && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-2xl shadow-xl overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="py-2">
                  {combined.map((item) => (
                    item.type === "player" ? (
                      <button
                        key={`player-${item.data.id}`}
                        className="w-full flex items-center gap-3 px-4 py-3 hover-elevate text-left transition-colors group"
                        data-testid={`suggestion-player-${item.data.id}`}
                        onClick={() => {
                          setLocation(`/players/${(item.data as { player_id?: string }).player_id ?? item.data.id}`);
                          setShowSuggestions(false);
                        }}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-border">
                          <img 
                            src={item.data.headshotUrl || DEFAULT_HEADSHOT} 
                            alt={item.data.name}
                            className="w-full h-full object-cover object-top"
                            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="font-display font-bold text-foreground group-hover:text-primary transition-colors">
                            {item.data.name}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono uppercase">
                            {item.data.team} • #{item.data.jerseyNumber}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <button
                        key={`team-${item.data.name}`}
                        className="w-full flex items-center gap-3 px-4 py-3 hover-elevate text-left transition-colors group"
                        data-testid={`suggestion-team-${item.data.name}`}
                        onClick={() => {
                          const season = item.data.season || "2025-26";
                          setLocation(`/roster/${encodeURIComponent(item.data.name)}/${season}`);
                          setShowSuggestions(false);
                        }}
                      >
                        <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center border border-border">
                          <Users className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="font-display font-bold text-foreground group-hover:text-primary transition-colors">
                            {item.data.name}
                          </div>
                          <div className="text-xs text-muted-foreground font-mono uppercase">
                            {item.data.league}
                          </div>
                        </div>
                      </button>
                    )
                  ))}
                </div>
              </div>
            )}
            
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
            { label: "Active Players", value: `${playersCountData?.count ?? players?.length ?? 0}+`, icon: Users },
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

      {/* TRENDING SECTION */}
      <section className="py-24 bg-background relative overflow-hidden">
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
              <div className="aspect-[3/4] rounded-xl bg-card/50 animate-pulse border border-border md:hidden" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-6 md:hidden">
                {trendingPlayers?.slice(0, 6).map((player) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
              <div className="hidden md:grid md:grid-cols-5 gap-6 md:gap-8">
                {trendingPlayers?.slice(0, 5).map((player) => (
                  <PlayerCard key={player.id} player={player} />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* FEATURED PLAYERS */}
      <section className="py-24 bg-muted relative overflow-hidden border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between gap-4 mb-12 flex-wrap">
            <div>
              <h2 className="text-4xl md:text-5xl text-foreground mb-2">Featured <span className="text-primary">Athletes</span></h2>
              <p className="text-muted-foreground">Top performers from the current season</p>
            </div>
            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => setShowFeaturedPicker(!showFeaturedPicker)}
                  data-testid="button-featured-picker-toggle"
                >
                  {showFeaturedPicker ? <X className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
                  {showFeaturedPicker ? "Close" : "Edit Featured"}
                </Button>
              )}
              <Link href="/players">
                <Button variant="outline" className="hidden md:flex gap-2">
                  View All Players
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>

          {isAdmin && showFeaturedPicker && (
            <div className="mb-8 bg-card border border-border rounded-md p-4" data-testid="featured-picker-panel">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-4 h-4 text-primary" />
                <span className="font-display text-sm uppercase tracking-wider">Admin: Select Featured Players (max 10)</span>
              </div>
              {featuredIds && featuredIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {featuredIds.map((id) => {
                    const p = players?.find((pl) => pl.id === id || Number(pl.id) === id);
                    if (!p) return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1" data-testid={`featured-badge-${id}`}>
                        <span className="font-mono text-xs">ID {id}</span>
                        <button type="button" className="ml-1 inline-flex items-center justify-center" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFeatured(id); }} data-testid={`button-remove-featured-${id}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                    return (
                      <Badge key={id} variant="secondary" className="gap-1 pr-1" data-testid={`featured-badge-${id}`}>
                        <img src={p.headshotUrl || DEFAULT_HEADSHOT} alt="" className="w-5 h-5 rounded-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }} />
                        {p.name}
                        <button type="button" className="ml-1 inline-flex items-center justify-center" onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFeatured(id); }} data-testid={`button-remove-featured-${id}`}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    );
                  })}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={featuredSearch}
                  onChange={(e) => setFeaturedSearch(e.target.value)}
                  placeholder="Search players to add..."
                  className="w-full pl-9 pr-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  data-testid="input-featured-search"
                />
              </div>
              {featuredSearch.trim().length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Type a player name to search (e.g. LeBron, Curry)</p>
              ) : isLoadingFeaturedSearch ? (
                <p className="mt-2 text-sm text-muted-foreground">Searching…</p>
              ) : featuredPickerResults.length > 0 ? (
                <div className="mt-2 border border-border rounded-md overflow-hidden max-h-64 overflow-y-auto">
                  {featuredPickerResults.map((p) => {
                    const isFeatured = featuredIds?.includes(Number(p.id));
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2 hover-elevate text-left transition-colors disabled:opacity-60"
                        onClick={() => toggleFeatured(p.id)}
                        disabled={featuredMutation.isPending}
                        data-testid={`featured-option-${p.id}`}
                      >
                        <div className="w-8 h-8 rounded-full overflow-hidden border border-border flex-shrink-0">
                          <img src={p.headshotUrl || DEFAULT_HEADSHOT} alt={p.name} className="w-full h-full object-cover object-top" onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-display font-bold text-sm text-foreground truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground font-mono uppercase">{p.team} • #{p.jerseyNumber}</div>
                        </div>
                        {isFeatured ? (
                          <Badge variant="default" className="flex-shrink-0"><Minus className="w-3 h-3 mr-1" />Remove</Badge>
                        ) : (
                          <Badge variant="outline" className="flex-shrink-0">
                            {featuredMutation.isPending ? "…" : <><Plus className="w-3 h-3 mr-1" />Add</>}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No players found. Try a different name.</p>
              )}
            </div>
          )}
          {(isLoadingFeatured || isLoading) ? (
            <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-6 md:gap-8">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="aspect-[3/4] rounded-xl bg-card/50 animate-pulse border border-border" />
              ))}
              <div className="aspect-[3/4] rounded-xl bg-card/50 animate-pulse border border-border md:hidden" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-6 md:hidden">
                {displayFeatured.slice(0, 6).map((player) => (
                  <div key={player.id} className="relative group">
                    <PlayerCard player={player} />
                    {isAdmin && hasSavedFeatured && (
                      <div className="absolute top-1 right-1 z-[100] pointer-events-none">
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="pointer-events-auto opacity-90 hover:opacity-100 shadow-md h-7 w-7 rounded-full"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFromFeatured(player.id); }}
                          disabled={featuredMutation.isPending}
                          title="Remove from featured"
                          data-testid={`button-remove-featured-card-${player.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="hidden md:grid md:grid-cols-5 gap-6 md:gap-8">
                {displayFeatured.slice(0, 5).map((player) => (
                  <div key={player.id} className="relative group">
                    <PlayerCard player={player} />
                    {isAdmin && hasSavedFeatured && (
                      <div className="absolute top-1 right-1 z-[100] pointer-events-none">
                        <Button
                          type="button"
                          size="icon"
                          variant="destructive"
                          className="pointer-events-auto opacity-90 hover:opacity-100 shadow-md h-7 w-7 rounded-full"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); removeFromFeatured(player.id); }}
                          disabled={featuredMutation.isPending}
                          title="Remove from featured"
                          data-testid={`button-remove-featured-card-${player.id}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
          
          <div className="mt-12 text-center md:hidden">
            <Link href="/players">
              <Button variant="outline" className="w-full">View Directory</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FAVORITES SECTION */}
      <FavoritesBar players={players} />

      {/* ADMIN LOGIN: on mobile at bottom of page (in flow); on desktop fixed bottom-right */}
      <div className="md:fixed md:bottom-6 md:right-6 z-50 mt-8 md:mt-0 px-4 pb-8 md:pb-0 md:px-0">
        {!isAdmin && !showAdminLogin && (
          <Button
            size="icon"
            variant="outline"
            className="rounded-full opacity-30 hover:opacity-100 transition-opacity"
            onClick={() => setShowAdminLogin(true)}
            data-testid="button-home-admin-login-toggle"
          >
            <Lock className="w-4 h-4" />
          </Button>
        )}

        {showAdminLogin && (
          <div className="bg-card border border-border rounded-md p-4 shadow-2xl w-72">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="font-display text-sm uppercase tracking-wider">Admin Login</span>
              <Button size="icon" variant="ghost" onClick={() => { setShowAdminLogin(false); setAdminError(""); }} data-testid="button-home-admin-close">
                <X className="w-4 h-4" />
              </Button>
            </div>
            <input
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
              placeholder="Password"
              className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
              data-testid="input-home-admin-password"
            />
            {adminError && <p className="text-destructive text-xs mb-2">{adminError}</p>}
            <Button className="w-full" onClick={handleAdminLogin} data-testid="button-home-admin-submit">
              Login
            </Button>
          </div>
        )}

        {isAdmin && !showAdminLogin && (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-card border-primary/30 text-primary px-3 py-1">
              <Lock className="w-3 h-3 mr-1" /> Admin
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground text-xs"
              onClick={handleAdminLogout}
              data-testid="button-admin-logout"
            >
              <LogOut className="w-3 h-3 mr-1" /> Logout
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FavoritesBar({ players }: { players: Player[] | undefined }) {
  const [favoritePlayers, setFavoritePlayers] = useState<{ id: string; name?: string; headshotUrl?: string; team?: string }[]>([]);
  const [favTeams, setFavTeams] = useState<string[]>([]);

  const refreshFavorites = useCallback(() => {
    setFavoritePlayers(getPlayerFavorites());
    setFavTeams(JSON.parse(localStorage.getItem("team_favorites") || "[]"));
  }, []);

  useEffect(() => {
    refreshFavorites();
  }, [refreshFavorites]);

  useEffect(() => {
    const onFocus = () => refreshFavorites();
    window.addEventListener("focus", onFocus);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "player_favorites" || e.key === "team_favorites") refreshFavorites();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshFavorites]);

  return (
    <section className="py-6 bg-background border-y border-border overflow-hidden">
      <div className="container mx-auto px-4">
        <div className="flex items-center gap-6 overflow-x-auto pb-2 no-scrollbar">
          <div className="flex-shrink-0 flex items-center gap-2 pr-6 border-r border-border">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="font-display text-sm md:text-xl font-bold uppercase tracking-tight">Your Favorites</span>
          </div>
          <div className="flex items-center gap-4">
            {favTeams.map((teamName) => (
              <Link key={teamName} href={`/players?team=${encodeURIComponent(teamName)}`} className="group relative">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-110 shadow-sm bg-white flex items-center justify-center p-1.5">
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
                <Link key={player.id} href={`/players/${encodeURIComponent(player.id)}`} className="group relative">
                  <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-110 shadow-sm">
                    <img
                      src={player.headshotUrl || DEFAULT_HEADSHOT}
                      alt={player.name || "Player"}
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
                  <div key={i} className="w-12 h-12 rounded-full border-2 border-border bg-muted/50 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                ))}
              </div>
            )}
            <Link href="/players" className="w-12 h-12 rounded-full border-2 border-dashed border-border flex items-center justify-center hover:border-primary hover:text-primary transition-all group">
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
