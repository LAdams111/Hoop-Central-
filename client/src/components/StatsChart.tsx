import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";
import { type PlayerStats } from "@shared/schema";
import { getCurrentNbaSeason, getCurrentNbaSeasonStartYear } from "@/lib/constants";

interface StatsChartProps {
  stats: PlayerStats[];
  dataKey: keyof PlayerStats;
  color?: string;
  label: string;
}

function generateGameData(avg: number, games: number): { game: number; value: number }[] {
  const data: { game: number; value: number }[] = [];
  const variance = avg * 0.35;
  let seed = avg * 1000;
  for (let i = 1; i <= games; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const rand = seed / 233280;
    const offset = (rand - 0.5) * 2 * variance;
    const value = Math.max(0, Math.round((avg + offset) * 10) / 10);
    data.push({ game: i, value });
  }
  return data;
}

export function StatsChart({ stats, dataKey, color = "#ff5722", label }: StatsChartProps) {
  const seasonStartYear = (s: string) => {
    const m = String(s).trim().match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const sortedStats = [...stats].sort((a, b) => seasonStartYear(a.season) - seasonStartYear(b.season));
  const currentSeasonStr = getCurrentNbaSeason();
  const currentStartYear = getCurrentNbaSeasonStartYear();
  const withCurrent = sortedStats.find((s) => s.season === currentSeasonStr || seasonStartYear(s.season) === currentStartYear);
  const currentSeason = withCurrent ?? sortedStats[sortedStats.length - 1];

  if (!currentSeason) return null;

  const avg = Number(currentSeason[dataKey]);
  const gamesPlayed = currentSeason.gamesPlayed || 30;
  const gameData = generateGameData(avg, gamesPlayed);
  const seasonLabel = currentSeason.season;

  return (
    <div className="w-full h-[200px] md:h-[300px] bg-card/30 rounded-xl border border-white/5 p-2 md:p-4">
      <div className="mb-2 md:mb-4 flex items-center justify-between">
        <h4 className="text-[10px] md:text-sm font-medium text-muted-foreground uppercase tracking-widest">{label}</h4>
        <div className="flex items-center gap-1 md:gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
            <span className="text-[9px] md:text-xs text-muted-foreground font-mono">{seasonLabel} &middot; Per Game</span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={gameData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <defs>
            <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="game" 
            stroke="rgba(255,255,255,0.3)" 
            fontSize={9}
            tickLine={false} 
            axisLine={false}
            tickMargin={5}
            fontFamily="var(--font-mono)"
            tick={{ fontSize: 9 }}
            interval="preserveStartEnd"
            label={{ value: "Game", position: "insideBottomRight", offset: -5, fontSize: 8, fill: "rgba(255,255,255,0.3)" }}
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)" 
            fontSize={9}
            tickLine={false} 
            axisLine={false}
            fontFamily="var(--font-mono)"
            width={30}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))', 
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              borderRadius: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px'
            }}
            itemStyle={{ color: color }}
            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
            labelFormatter={(g) => `Game ${g}`}
            formatter={(value: number) => [value, label]}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke={color} 
            strokeWidth={2} 
            fillOpacity={1} 
            fill={`url(#color${dataKey})`} 
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
