import { useRoute, useLocation } from "wouter";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Calendar } from "lucide-react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Roster() {
  const [, params] = useRoute("/roster/:team/:season");
  const [, setLocation] = useLocation();
  const team = decodeURIComponent(params?.team || "");
  const season = decodeURIComponent(params?.season || "");
  
  const { data: players, isLoading } = usePlayers();

  // Get unique seasons available for this team across all players, with fallback to 2020-2025
  const baseSeasons = ["2024-25", "2023-24", "2022-23", "2021-22", "2020-21"];
  const playerSeasons = players?.flatMap(p => (p as any).stats
      ?.filter((s: any) => s.team === team)
      .map((s: any) => s.season)
    ).filter(Boolean) || [];
  
  const availableSeasons = Array.from(new Set([...baseSeasons, ...playerSeasons]))
    .sort((a, b) => b.localeCompare(a));

  // Filter players who played for this team in this season
  const rosterPlayers = players?.filter(player => 
    (player as any).stats?.some((stat: any) => {
      // Normalize both for comparison
      const statTeam = stat.team?.trim().toLowerCase();
      const targetTeam = team?.trim().toLowerCase();
      const statSeason = stat.season?.trim();
      const targetSeason = season?.trim();
      
      return statTeam === targetTeam && statSeason === targetSeason;
    })
  ) || [];

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

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-muted border-b border-border py-12">
        <div className="container mx-auto px-4">
          <Link href="/">
            <Button variant="ghost" className="mb-8 -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-10 h-10" />
              </div>
              <div>
                <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tighter uppercase">
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
                <SelectTrigger className="w-full bg-background border-2 border-border h-12 rounded-xl text-lg font-mono">
                  <SelectValue placeholder="Choose Season" />
                </SelectTrigger>
                <SelectContent>
                  {availableSeasons.map((s) => (
                    <SelectItem key={s as string} value={s as string} className="font-mono">
                      {s as string} Season
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {rosterPlayers.length > 0 ? (
            rosterPlayers.map((player) => (
              <div key={player.id} className="h-[500px]">
                <PlayerCard player={player} />
              </div>
            ))
          ) : (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-6">
              <p className="text-muted-foreground font-display text-2xl uppercase">No players found for this roster</p>
              
              {/* Profile Pics/Links Gateway */}
              <div className="w-full max-w-4xl px-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {players?.map((player) => (
                    <Link key={player.id} href={`/players/${player.id}`} className="group">
                      <div className="flex flex-col items-center gap-2 p-3 rounded-xl hover:bg-muted transition-colors">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-colors">
                          <img 
                            src={player.headshotUrl} 
                            alt={player.name}
                            className="w-full h-full object-cover object-top"
                          />
                        </div>
                        <span className="text-xs font-mono text-center uppercase tracking-tighter truncate w-full">
                          {player.name}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
