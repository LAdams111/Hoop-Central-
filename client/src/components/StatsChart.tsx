import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Area,
  AreaChart
} from "recharts";
import { type PlayerStats } from "@shared/schema";

interface StatsChartProps {
  stats: PlayerStats[];
  dataKey: keyof PlayerStats;
  color?: string;
  label: string;
}

export function StatsChart({ stats, dataKey, color = "#ff5722", label }: StatsChartProps) {
  // Sort stats by season chronologically if needed, assuming season string is sortable "2020-21"
  const sortedStats = [...stats].sort((a, b) => a.season.localeCompare(b.season));

  return (
    <div className="w-full h-[300px] bg-card/30 rounded-xl border border-white/5 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-widest">{label} Trend</h4>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></span>
            <span className="text-xs text-muted-foreground font-mono">Per Game</span>
        </div>
      </div>
      
      <ResponsiveContainer width="100%" height="85%">
        <AreaChart data={sortedStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id={`color${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
              <stop offset="95%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="season" 
            stroke="rgba(255,255,255,0.3)" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
            tickMargin={10}
            fontFamily="var(--font-mono)"
          />
          <YAxis 
            stroke="rgba(255,255,255,0.3)" 
            fontSize={12} 
            tickLine={false} 
            axisLine={false}
            fontFamily="var(--font-mono)"
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'hsl(var(--card))', 
              borderColor: 'hsl(var(--border))',
              color: 'hsl(var(--foreground))',
              borderRadius: '8px',
              fontFamily: 'var(--font-mono)'
            }}
            itemStyle={{ color: color }}
            cursor={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <Area 
            type="monotone" 
            dataKey={dataKey} 
            stroke={color} 
            strokeWidth={3} 
            fillOpacity={1} 
            fill={`url(#color${dataKey})`} 
            animationDuration={1500}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
