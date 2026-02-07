import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PlayerCard } from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, Flag } from "lucide-react";
import { Link } from "wouter";
import { Player } from "@shared/schema";
import { useState, useEffect } from "react";

export default function TeamRoster() {
  const [, params] = useRoute("/roster/:team/:season");
  const team = params?.team || "";
  const season = params?.season || "";
  const [isFavorited, setIsFavorited] = useState(false);

  useEffect(() => {
    if (!team) return;
    const favorites = JSON.parse(localStorage.getItem('team_favorites') || '[]');
    setIsFavorited(favorites.includes(team));
  }, [team]);

  const toggleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem('team_favorites') || '[]');
    let newFavorites;
    if (favorites.includes(team)) {
      newFavorites = favorites.filter((favName: string) => favName !== team);
    } else {
      newFavorites = [...favorites, team];
    }
    localStorage.setItem('team_favorites', JSON.stringify(newFavorites));
    setIsFavorited(!isFavorited);
  };

  const { data: players, isLoading } = useQuery<Player[]>({
    queryKey: [`/api/teams/${team}/roster/${season}`],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-12 pb-24 bg-background">
      <div className="container mx-auto px-4">
        <div className="mb-12">
          <Link href="/players">
            <Button variant="ghost" className="mb-4 -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Directory
            </Button>
          </Link>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Users className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-4xl md:text-6xl font-display text-foreground uppercase tracking-tighter">
                  {team} <span className="text-primary">Roster</span>
                </h1>
                <p className="text-muted-foreground font-mono">{season} Season</p>
              </div>
            </div>
            <Button 
              variant={isFavorited ? "default" : "secondary"}
              className={`h-12 px-6 flex items-center gap-2 rounded-xl border-2 ${isFavorited ? 'border-primary' : 'border-border'} transition-all`}
              onClick={toggleFavorite}
            >
              <Flag className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
              <span className="font-display font-bold uppercase tracking-tight">Favorite Team</span>
            </Button>
          </div>
        </div>

        {!players || players.length === 0 ? (
          <div className="text-center py-24 bg-card/30 rounded-3xl border border-dashed border-white/10">
            <h3 className="font-display text-2xl text-muted-foreground">No roster data available</h3>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {players.map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
