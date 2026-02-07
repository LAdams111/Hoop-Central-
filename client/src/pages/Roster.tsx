import { useRoute } from "wouter";
import { usePlayers } from "@/hooks/use-players";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import { Link } from "wouter";

export default function Roster() {
  const [, params] = useRoute("/roster/:team/:season");
  const team = decodeURIComponent(params?.team || "");
  const season = decodeURIComponent(params?.season || "");
  
  const { data: players, isLoading } = usePlayers();

  // Filter players who played for this team in this season
  const rosterPlayers = players?.filter(player => 
    (player as any).stats.some((stat: any) => stat.team === team && stat.season === season)
  ) || [];

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
          
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Users className="w-10 h-10" />
            </div>
            <div>
              <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tighter uppercase">
                {team}
              </h1>
              <p className="font-mono text-xl text-muted-foreground uppercase tracking-widest">
                {season} Season Roster
              </p>
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
            <div className="col-span-full py-20 text-center border-2 border-dashed border-border rounded-2xl">
              <p className="text-muted-foreground font-display text-2xl uppercase">No players found for this roster</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
