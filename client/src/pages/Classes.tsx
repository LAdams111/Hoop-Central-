import { usePlayers } from "@/hooks/use-players";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Users, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function Classes() {
  const { data: players, isLoading } = usePlayers();
  const [selectedYear, setSelectedYear] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Extract years from player birthDates
  const yearsMap = new Map<string, any[]>();
  players?.forEach(player => {
    if (player.birthDate) {
      const year = new Date(player.birthDate).getFullYear().toString();
      if (!yearsMap.has(year)) {
        yearsMap.set(year, []);
      }
      yearsMap.get(year)?.push(player);
    }
  });

  const sortedYears = Array.from(yearsMap.keys()).sort((a, b) => b.localeCompare(a));
  const currentGradYear = "2007"; // Assuming birth year 2007 is graduating this year (age 18 in 2025)

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12">
        <h1 className="font-display text-5xl font-bold mb-4">Classes</h1>
        <p className="text-muted-foreground text-lg">Browse athletes by their birth year.</p>
      </div>

      {!selectedYear ? (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
          {sortedYears.map(year => {
            const isGraduating = year === currentGradYear;
            return (
              <Card 
                key={year} 
                className={`hover-elevate cursor-pointer border-2 transition-all group ${
                  isGraduating ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "hover:border-primary border-border"
                }`}
                onClick={() => setSelectedYear(year)}
                data-testid={`card-year-${year}`}
              >
                <CardHeader className="text-center pb-2 relative">
                  {isGraduating && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-[10px] text-white px-2 py-0.5 rounded-full font-bold tracking-tighter uppercase">
                      Draft Year
                    </div>
                  )}
                  <Calendar className={`w-6 h-6 mx-auto mb-2 transition-colors ${isGraduating ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                  <CardTitle className="font-display text-3xl">{year}</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                  <div className={`flex items-center justify-center gap-2 text-xs font-mono ${isGraduating ? "text-primary/80 font-bold" : "text-muted-foreground"}`}>
                    <Users className="w-3 h-3" />
                    {yearsMap.get(year)?.length || 0} PLAYERS
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={() => setSelectedYear(null)} size="sm">
              Back to Classes
            </Button>
            <h2 className="font-display text-3xl">Class of {selectedYear}</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {yearsMap.get(selectedYear)?.map(player => (
              <Link key={player.id} href={`/players/${player.id}`}>
                <Card className="hover-elevate cursor-pointer overflow-hidden border-border hover:border-primary/50 transition-all h-full">
                  <div className="flex items-center p-4 gap-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex-shrink-0 border-2 border-border group-hover:border-primary transition-colors">
                      <img src={player.headshotUrl} alt={player.name} className="w-full h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-0.5">{player.team}</div>
                      <h3 className="font-display text-xl font-bold truncate leading-none">{player.name}</h3>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{player.position} • #{player.jerseyNumber}</div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
