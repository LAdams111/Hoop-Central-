import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Flame, ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Player } from "@shared/schema";
import { DEFAULT_HEADSHOT } from "@/lib/constants";

export default function Prospects() {
  const { data: prospects, isLoading } = useQuery<Player[]>({
    queryKey: ['/api/players/prospects'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const getAge = (birthDate: string | null) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
  };

  return (
    <div className="min-h-screen pt-12 pb-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="mb-10">
          <Link href="/">
            <Button variant="ghost" className="mb-4 -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>
          <div className="flex items-center gap-4 mb-2">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
              <Flame className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-4xl md:text-6xl font-display text-foreground uppercase tracking-tighter">
                Hottest <span className="text-primary">Prospects</span>
              </h1>
              <p className="text-muted-foreground font-mono text-sm">Top 50 most viewed players under 20</p>
            </div>
          </div>
        </div>

        {!prospects || prospects.length === 0 ? (
          <div className="text-center py-24 bg-card/30 rounded-3xl border border-dashed border-white/10">
            <Flame className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-display text-2xl text-muted-foreground">No prospects found</h3>
            <p className="text-sm text-muted-foreground mt-2">No players under 20 in the database yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {prospects.map((player, index) => {
              const age = getAge(player.birthDate);
              return (
                <Link key={player.id} href={`/players/${(player as { player_id?: string }).player_id ?? player.id}`} className="block group">
                  <div className="flex items-center gap-3 md:gap-4 px-3 md:px-5 py-3 md:py-4 rounded-xl bg-card border border-border hover:border-primary/40 transition-all cursor-pointer group-hover:bg-card/80"
                    data-testid={`prospect-row-${player.id}`}
                  >
                    <div className="w-7 text-center font-mono text-sm text-muted-foreground flex-shrink-0">
                      {index + 1}
                    </div>

                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-full overflow-hidden border border-border flex-shrink-0">
                      <img
                        src={player.headshotUrl || DEFAULT_HEADSHOT}
                        alt={player.name}
                        className="w-full h-full object-cover object-top"
                        onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="font-display font-bold text-foreground group-hover:text-primary transition-colors text-sm md:text-base truncate">
                        {player.name}
                      </div>
                      <div className="text-[10px] md:text-xs text-muted-foreground font-mono uppercase truncate">
                        {player.team} {player.position ? `• ${player.position}` : ""}
                      </div>
                    </div>

                    {age !== null && (
                      <Badge variant="secondary" className="text-[10px] md:text-xs flex-shrink-0">
                        Age {age}
                      </Badge>
                    )}

                    <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono flex-shrink-0">
                      <Eye className="w-3 h-3" />
                      <span>{player.profileViews}</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
