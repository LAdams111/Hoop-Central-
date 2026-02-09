import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, Calendar, Trophy } from "lucide-react";
import { Link } from "wouter";
import { Player, TeamRecord } from "@shared/schema";
import { DEFAULT_HEADSHOT } from "@/lib/constants";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AVAILABLE_SEASONS = ["2025-26", "2024-25", "2023-24", "2022-23", "2021-22", "2020-21", "2018-19", "1997-98", "1995-96", "1992-93", "1987-88"];

export default function Roster() {
  const [, params] = useRoute("/roster/:team/:season");
  const [, setLocation] = useLocation();
  const team = decodeURIComponent(params?.team || "");
  const season = decodeURIComponent(params?.season || "");

  const { data: rosterPlayers, isLoading } = useQuery<Player[]>({
    queryKey: ['/api/teams', team, 'roster', season],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${encodeURIComponent(team)}/roster/${encodeURIComponent(season)}`);
      if (!res.ok) throw new Error("Failed to fetch roster");
      return res.json();
    },
    enabled: !!team && !!season,
  });

  const { data: teamRecord } = useQuery<TeamRecord | null>({
    queryKey: ['/api/teams', team, 'record', season],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${encodeURIComponent(team)}/record/${encodeURIComponent(season)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!team && !!season,
  });

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

  const players = rosterPlayers || [];

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-muted border-b border-border py-12">
        <div className="container mx-auto px-4">
          <Button variant="outline" size="sm" className="rounded-full mb-8" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-10 h-10" />
              </div>
              <div>
                <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tighter uppercase" data-testid="text-team-name">
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
                <SelectTrigger className="w-full bg-background border-2 border-border h-12 rounded-xl text-lg font-mono" data-testid="select-season">
                  <SelectValue placeholder="Choose Season" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_SEASONS.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono" data-testid={`option-season-${s}`}>
                      {s} Season
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        <div className="flex items-center justify-between gap-3 mb-8 border-b border-border pb-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-display text-3xl font-bold uppercase tracking-tight" data-testid="text-season-heading">{season} Season Roster</h2>
            {players.length > 0 && (
              <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-widest">{players.length} Active</Badge>
            )}
          </div>
          {teamRecord && (
            <div className="flex items-center gap-3" data-testid="team-record">
              <Trophy className="w-4 h-4 text-primary" />
              <span className="font-display text-2xl font-bold tracking-tight">
                <span className="text-primary">{teamRecord.wins}</span>
                <span className="text-muted-foreground mx-1">-</span>
                <span className="text-muted-foreground">{teamRecord.losses}</span>
              </span>
              <span className="text-xs font-mono text-muted-foreground uppercase tracking-widest">W-L</span>
            </div>
          )}
        </div>

        {players.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-8" data-testid="roster-players-grid">
            {players.map((player) => (
              <Link key={player.id} href={`/players/${player.id}`} className="group" data-testid={`link-player-${player.id}`}>
                <div className="flex flex-col items-center gap-4 p-6 rounded-3xl hover:bg-muted transition-all duration-300 border border-transparent hover:border-border">
                  <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-border group-hover:border-primary transition-all duration-300 group-hover:scale-105 shadow-md">
                    <img 
                      src={player.headshotUrl || DEFAULT_HEADSHOT} 
                      alt={player.name}
                      className="w-full h-full object-cover object-top"
                      data-testid={`img-player-${player.id}`}
                      onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xl font-display font-bold text-center uppercase leading-none group-hover:text-primary transition-colors" data-testid={`text-player-name-${player.id}`}>
                      {player.name}
                    </span>
                    <span className="text-2xl font-display font-bold text-primary" data-testid={`text-player-jersey-${player.id}`}>
                      #{player.jerseyNumber}
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
          <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-6" data-testid="empty-roster-state">
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
