import { Link } from "wouter";
import { type Player } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Ruler, Weight } from "lucide-react";

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  return (
    <Link href={`/players/${player.id}`} className="block group h-full">
      <Card className="h-full bg-card border-border hover:border-primary/50 hover:bg-card/80 transition-all duration-300 overflow-hidden relative cursor-pointer group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-primary/5">
        
        {/* Image Container with Gradient Overlay */}
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 opacity-60" />
          <img 
            src={player.headshotUrl} 
            alt={player.name}
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          
          {/* Jersey Number Badge */}
          <div className="absolute top-4 right-4 z-20 font-display text-4xl font-bold text-foreground/5 group-hover:text-primary/10 transition-colors">
            #{player.jerseyNumber}
          </div>
          
          {/* Position Badge */}
          <div className="absolute bottom-4 left-4 z-20">
            <Badge variant="secondary" className="bg-primary text-white hover:bg-primary/90 font-bold tracking-wider rounded-sm">
              {player.position}
            </Badge>
          </div>
        </div>

        <CardContent className="p-5 space-y-3 relative z-20">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">
              {player.team}
            </div>
            <h3 className="font-display text-2xl font-bold leading-none text-foreground group-hover:text-primary transition-colors">
              {player.name}
            </h3>
          </div>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground border-t border-border pt-3">
            <div className="flex items-center gap-1.5">
              <Ruler className="w-3.5 h-3.5" />
              <span>{player.height}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Weight className="w-3.5 h-3.5" />
              <span>{player.weight}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
