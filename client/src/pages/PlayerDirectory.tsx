import { useState, useEffect } from "react";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Filter, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocation } from "wouter";

const POSITIONS = ["ALL", "PG", "SG", "SF", "PF", "C"];

export default function PlayerDirectory() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(location.split('?')[1]);
  
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [position, setPosition] = useState("ALL");
  const [debouncedSearch, setDebouncedSearch] = useState(search);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: players, isLoading } = usePlayers({ 
    search: debouncedSearch, 
    position: position === "ALL" ? undefined : position 
  });

  const clearFilters = () => {
    setSearch("");
    setPosition("ALL");
  };

  return (
    <div className="min-h-screen pt-12 pb-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <h1 className="text-5xl md:text-7xl font-display text-foreground mb-4">
              Player <span className="text-primary text-glow">Directory</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              Browse the complete roster. Filter by position or search by name to find specific athlete stats.
            </p>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="sticky top-20 z-40 bg-background/95 backdrop-blur-xl border border-border rounded-2xl p-4 mb-12 shadow-2xl">
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

        {/* Results Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-[4/5] bg-card/50 rounded-xl animate-pulse border border-border" />
            ))}
          </div>
        ) : players?.length === 0 ? (
          <div className="text-center py-24 bg-card/30 rounded-3xl border border-dashed border-border">
            <h3 className="font-display text-2xl text-muted-foreground mb-2">No players found</h3>
            <p className="text-sm text-muted-foreground/60">Try adjusting your search or filters</p>
            <Button variant="ghost" onClick={clearFilters} className="mt-4 text-primary">Clear all filters</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {players?.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
