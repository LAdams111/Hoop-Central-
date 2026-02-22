import { useState, useMemo } from "react";
import { useRailwayPlayers } from "@/hooks/use-railway-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, X, Cloud, Loader2, AlertCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";
import type { RailwayPlayerDisplay } from "@/lib/railwayPlayer";

const POSITIONS = ["ALL", "PG", "SG", "SF", "PF", "C"];

function filterPlayers(
  players: RailwayPlayerDisplay[],
  search: string,
  position: string
): RailwayPlayerDisplay[] {
  let out = players;
  const q = search.trim().toLowerCase();
  if (q) {
    out = out.filter((p) => p.name.toLowerCase().includes(q));
  }
  if (position !== "ALL") {
    out = out.filter((p) => (p.position || "").toUpperCase() === position);
  }
  return out;
}

export default function RailwayPlayers() {
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("ALL");

  const { data: players = [], isLoading, error } = useRailwayPlayers();
  const filtered = useMemo(
    () => filterPlayers(players, search, position),
    [players, search, position]
  );

  const clearFilters = () => {
    setSearch("");
    setPosition("ALL");
  };

  return (
    <div className="min-h-screen pt-12 pb-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 md:mb-12 gap-3 md:gap-6">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Cloud className="w-4 h-4" />
              <span className="font-mono uppercase tracking-wider">Railway Scraper</span>
            </div>
            <h1 className="text-3xl md:text-7xl font-display text-foreground mb-2 md:mb-4">
              NBA <span className="text-primary text-glow">Players</span>
            </h1>
            <p className="text-muted-foreground text-sm md:text-lg max-w-xl">
              All players from the scraper on Railway—same layout as the main directory.
            </p>
          </div>
          <Link href="/scraper">
            <Button variant="outline" size="sm" className="rounded-full shrink-0">
              Data Scraper
            </Button>
          </Link>
        </div>

        {/* Filters */}
        <div className="sticky top-20 z-40 bg-background/95 backdrop-blur-xl border border-border rounded-2xl p-3 md:p-4 mb-6 md:mb-12 shadow-2xl">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search player name..."
                className="pl-10 bg-card/50 border-border"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={position} onValueChange={setPosition}>
              <SelectTrigger className="w-full md:w-[200px] bg-card/50 border-border">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <SelectValue placeholder="Position" />
                </div>
              </SelectTrigger>
              <SelectContent>
                {POSITIONS.map((pos) => (
                  <SelectItem key={pos} value={pos}>{pos === "ALL" ? "All Positions" : pos}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(search || position !== "ALL") && (
              <Button variant="ghost" onClick={clearFilters} className="text-muted-foreground hover:text-destructive">
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5 mb-8">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="font-medium text-destructive">Could not load scraper players</p>
              <p className="text-sm text-muted-foreground">{(error as Error).message}. Make sure the Railway scraper exposes GET /api/players.</p>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-card/50 rounded-xl animate-pulse border border-border" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 bg-card/30 rounded-3xl border border-dashed border-border">
            <h3 className="font-display text-2xl text-muted-foreground mb-2">
              {players.length === 0 ? "No players from scraper" : "No players match your filters"}
            </h3>
            <p className="text-sm text-muted-foreground/60">
              {players.length === 0
                ? "Ensure your Railway scraper exposes GET /api/players and returns an array of players."
                : "Try adjusting search or filters."}
            </p>
            {players.length > 0 && (
              <Button variant="ghost" onClick={clearFilters} className="mt-4 text-primary">
                Clear all filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4 md:gap-6">
            {filtered.map((player) => (
              <PlayerCard
                key={player.bbrefId ?? (player as { id?: number }).id}
                player={player}
                href={player.bbrefId ? `/players/railway/${encodeURIComponent(player.bbrefId)}` : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
