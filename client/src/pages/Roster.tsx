import { useRoute, useLocation } from "wouter";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  // Get all-time players for this team (those who have any stats with this team)
  const allTimeTeamPlayers = players?.filter(player => 
    (player as any).stats?.some((stat: any) => 
      stat.team?.trim().toLowerCase() === team?.trim().toLowerCase()
    )
  ) || [];

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
        {/* All-Time Team Players Section */}
        <div className="mb-16">
          <div className="flex items-center gap-3 mb-8 border-b border-border pb-4">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight">All-Time {team} Players</h2>
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">{allTimeTeamPlayers.length} Players</Badge>
          </div>
          
          <div className="flex flex-wrap justify-center gap-6">
            {allTimeTeamPlayers.map((player) => (
              <Link key={player.id} href={`/players/${player.id}`} className="group">
                <div className="flex flex-col items-center gap-3 p-4 rounded-2xl hover:bg-muted transition-all duration-300 border border-transparent hover:border-border">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-105 shadow-sm">
                    <img 
                      src={player.headshotUrl} 
                      alt={player.name}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-sm font-display font-bold text-center uppercase leading-none group-hover:text-primary transition-colors">
                      {player.name}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">
                      View Profile
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Seasonal Roster Section */}
        <div className="flex items-center gap-3 mb-8 border-b border-border pb-4">
          <h2 className="font-display text-3xl font-bold uppercase tracking-tight">{season} Season Roster</h2>
          {rosterPlayers.length > 0 && (
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">{rosterPlayers.length} Active</Badge>
          )}
        </div>

        {rosterPlayers.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-8">
            {rosterPlayers.map((player) => (
              <Link key={player.id} href={`/players/${player.id}`} className="group">
                <div className="flex flex-col items-center gap-4 p-6 rounded-3xl hover:bg-muted transition-all duration-300 border border-transparent hover:border-border">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-105 shadow-md">
                    <img 
                      src={player.headshotUrl} 
                      alt={player.name}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl font-display font-bold text-center uppercase leading-none group-hover:text-primary transition-colors">
                      {player.name}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest mt-1">
                      View Profile
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-6">
            <div className="space-y-2">
              <p className="text-muted-foreground font-display text-2xl uppercase">No players found for this season</p>
              <p className="text-sm text-muted-foreground font-mono uppercase tracking-widest">Select a different season above</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
