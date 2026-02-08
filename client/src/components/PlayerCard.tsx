import { Link } from "wouter";
import { type Player } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Ruler, Weight } from "lucide-react";
import { DEFAULT_HEADSHOT } from "@/lib/constants";

interface PlayerCardProps {
  player: Player;
}

export function PlayerCard({ player }: PlayerCardProps) {
  return (
    <Link href={`/players/${player.id}`} className="block group h-full">
      <Card className="min-h-full bg-card border-border hover:border-primary/50 hover:bg-card/80 transition-all duration-300 overflow-hidden relative cursor-pointer group-hover:-translate-y-1 group-hover:shadow-lg group-hover:shadow-primary/5 flex flex-col">
        
        {/* Image Container with Gradient Overlay */}
        <div className="relative aspect-[4/5] overflow-hidden bg-muted flex-shrink-0">
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent z-10 opacity-60" />
          <img 
            src={player.headshotUrl || DEFAULT_HEADSHOT} 
            alt={player.name}
            className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
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

        <CardContent className="p-5 flex flex-col flex-1 justify-between gap-3 relative z-20">
          <div className="min-h-0">
            <div className="text-[10px] font-mono text-primary uppercase tracking-widest mb-1 truncate">
              {player.team}
            </div>
            <h3 className="font-display text-2xl font-bold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {player.name}
            </h3>
          </div>
          
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground border-t border-border pt-3 mt-auto whitespace-nowrap overflow-hidden">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Ruler className="w-3 h-3 text-primary" />
              <span>{player.height}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Weight className="w-3 h-3 text-primary" />
              <span>{player.weight}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
