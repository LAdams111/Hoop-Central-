import { Link } from "wouter";
import { type Player } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Ruler, Weight } from "lucide-react";
import { DEFAULT_HEADSHOT, TEAM_ABBREV_TO_FULL } from "@/lib/constants";

/** Show position as abbreviation (PG, SG, SF, PF, C). Pass-through if already short. */
function positionAbbrev(position: string | null | undefined): string {
  const p = String(position ?? "").trim();
  if (!p) return "—";
  if (p.length <= 3) return p; // already PG, SG, G, F, C, etc.
  const lower = p.toLowerCase();
  if (lower.includes("point guard") || lower.startsWith("point g")) return "PG";
  if (lower.includes("shooting guard") || lower.startsWith("shooting g")) return "SG";
  if (lower.includes("small forward") || lower.startsWith("small f")) return "SF";
  if (lower.includes("power forward") || lower.startsWith("power f")) return "PF";
  if (lower.includes("center") || lower === "c") return "C";
  if (lower.includes("guard")) return "G";
  if (lower.includes("forward")) return "F";
  return p;
}

interface PlayerCardProps {
  player: Player & { id?: number | string; bbrefId?: string; player_id?: string };
  /** When set (e.g. for Railway scraper players), used instead of /players/:id */
  href?: string;
}

export function PlayerCard({ player, href }: PlayerCardProps) {
  const profileId = player.player_id ?? player.id;
  const linkHref = href ?? `/players/${profileId}`;
  return (
    <Link href={linkHref} className="block group h-full">
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
          <div className="absolute top-2 right-2 md:top-4 md:right-4 z-20 font-display text-xl md:text-4xl font-bold text-foreground/5 group-hover:text-primary/10 transition-colors">
            #{player.jerseyNumber}
          </div>
          
          {/* Position Badge */}
          <div className="absolute bottom-2 left-2 md:bottom-4 md:left-4 z-20">
            <Badge variant="secondary" className="bg-primary text-white hover:bg-primary/90 font-bold tracking-wider rounded-sm text-[10px] md:text-xs px-1.5 md:px-2.5 py-0 md:py-0.5">
              {positionAbbrev(player.position)}
            </Badge>
          </div>
        </div>

        <CardContent className="p-2 md:p-5 flex flex-col flex-1 justify-between gap-1 md:gap-3 relative z-20">
          <div className="min-h-0">
            <div className="text-[8px] md:text-[10px] font-mono text-primary uppercase tracking-widest mb-0.5 md:mb-1 truncate">
              {TEAM_ABBREV_TO_FULL[player.team?.toUpperCase?.() ?? ""] ?? player.team}
            </div>
            <h3 className="font-display text-sm md:text-2xl leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
              {(() => {
                const parts = player.name.trim().split(/\s+/);
                if (parts.length <= 1) return <span className="font-bold">{player.name}</span>;
                const lastName = parts.pop();
                return <>{parts.join(" ")} <span className="font-bold">{lastName}</span></>;
              })()}
            </h3>
          </div>
          
          <div className="hidden md:flex items-center gap-3 text-[10px] font-mono text-muted-foreground border-t border-border pt-3 mt-auto whitespace-nowrap overflow-hidden">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Ruler className="w-3 h-3 text-primary" />
              <span>{player.height}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Weight className="w-3 h-3 text-primary" />
              <span>{player.weight && player.weight !== "—" ? (player.weight.toLowerCase().endsWith(" lbs") ? player.weight : `${player.weight} lbs`) : (player.weight ?? "—")}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
