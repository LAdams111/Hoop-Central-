import { usePlayers } from "@/hooks/use-players";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, ArrowRight, ArrowLeft, Eye } from "lucide-react";
import { useState } from "react";
import { Player } from "@shared/schema";

export default function Classes() {
  const { data: players, isLoading } = usePlayers();
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  const { data: birthYearPlayers, isLoading: isLoadingBirthYear } = useQuery<Player[]>({
    queryKey: ['/api/players/birth-year', selectedYear],
    queryFn: async () => {
      const res = await fetch(`/api/players/birth-year/${selectedYear}`);
      if (!res.ok) throw new Error("Failed to fetch players");
      return res.json();
    },
    enabled: !!selectedYear,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const yearsMap = new Map<string, number>();
  
  players?.forEach(player => {
    if (player.birthDate) {
      const year = new Date(player.birthDate).getFullYear().toString();
      yearsMap.set(year, (yearsMap.get(year) || 0) + 1);
    }
  });

  const sortedYears = Array.from(yearsMap.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12">
        <h1 className="font-display text-5xl font-bold mb-4">Birth Year</h1>
        <p className="text-muted-foreground text-lg">Browse players by the year they were born, ranked by profile views.</p>
      </div>

      {!selectedYear ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {sortedYears.map(year => (
            <Card 
              key={year} 
              className="hover-elevate cursor-pointer border-2 transition-all group hover:border-primary border-border"
              onClick={() => setSelectedYear(year)}
              data-testid={`card-year-${year}`}
            >
              <CardHeader className="text-center pb-2">
                <Calendar className="w-6 h-6 mx-auto mb-2 transition-colors text-muted-foreground group-hover:text-primary" />
                <CardTitle className="font-display text-3xl">{year}</CardTitle>
              </CardHeader>
              <CardContent className="text-center">
                <div className="flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {yearsMap.get(year) || 0} PLAYER{(yearsMap.get(year) || 0) !== 1 ? 'S' : ''}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setSelectedYear(null)} data-testid="button-back-years">
              <ArrowLeft className="w-4 h-4 mr-2" />
              All Years
            </Button>
            <h2 className="font-display text-3xl">Born in {selectedYear}</h2>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest ml-auto">Max 100 results &middot; Sorted by views</span>
          </div>

          {isLoadingBirthYear ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (birthYearPlayers && birthYearPlayers.length > 0) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {birthYearPlayers.map((player, index) => (
                <Link key={player.id} href={`/players/${player.id}`}>
                  <Card className="hover-elevate cursor-pointer overflow-hidden border-border hover:border-primary/50 transition-all h-full" data-testid={`card-player-${player.id}`}>
                    <div className="flex items-center p-4 gap-4">
                      <div className="flex items-center justify-center w-8 text-lg font-display font-bold text-muted-foreground">
                        {index + 1}
                      </div>
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-border">
                        <img src={player.headshotUrl} alt={player.name} className="w-full h-full object-cover object-top" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-0.5">{player.team}</div>
                        <h3 className="font-display text-xl font-bold truncate leading-none">{player.name}</h3>
                        <div className="text-xs text-muted-foreground font-mono mt-1">{player.position} &middot; #{player.jerseyNumber}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Eye className="w-3 h-3" />
                          <span className="font-mono font-bold">{player.profileViews}</span>
                        </div>
                        <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <div className="py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-6" data-testid="empty-birth-year-state">
              <div className="space-y-2">
                <p className="text-muted-foreground font-display text-2xl uppercase">No players found for {selectedYear}</p>
                <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Select a different year</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
