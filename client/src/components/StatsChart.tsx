import { 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from "recharts";
import { type PlayerStats } from "@shared/schema";

interface StatsChartProps {
  stats: PlayerStats[];
  dataKey: keyof PlayerStats;
  color?: string;
  label: string;
}

export function StatsChart({ stats, dataKey, color = "#ff5722", label }: StatsChartProps) {
  const sortedStats = [...stats].sort((a, b) => a.season.localeCompare(b.season));
  const currentSeason = sortedStats[sortedStats.length - 1];

  if (!currentSeason) return null;

  const isPointsChart = dataKey === "pointsPerGame";

  const chartData = isPointsChart
    ? [
        { name: "PPG", value: Number(currentSeason.pointsPerGame), fill: color },
        { name: "RPG", value: Number(currentSeason.reboundsPerGame), fill: "hsl(var(--accent))" },
        { name: "FG%", value: Number(currentSeason.fieldGoalPct), fill: "hsl(var(--muted-foreground))" },
      ]
    : [
        { name: "APG", value: Number(currentSeason.assistsPerGame), fill: color },
        { name: "SPG", value: Number(currentSeason.stealsPerGame), fill: "hsl(var(--accent))" },
        { name: "BPG", value: Number(currentSeason.blocksPerGame), fill: "hsl(var(--muted-foreground))" },
      ];

  const seasonLabel = currentSeason.season;

  return (
    <div className="w-full h-[200px] md:h-[300px] bg-card/30 rounded-xl border border-white/5 p-2 md:p-4">
      <div className="mb-2 md:mb-4 flex items-center justify-between">
        <h4 className="text-[10px] md:text-sm font-medium text-muted-foreground uppercase tracking-widest">{label}</h4>
        <span className="text-[9px] md:text-xs text-muted-foreground font-mono">{seasonLabel}</span>
      </div>
      
      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis 
            dataKey="name" 
            stroke="rgba(255,255,255,0.3)" 
            fontSize={10}
            tickLine={false} 
            axisLine={false}
            tickMargin={5}
            fontFamily="var(--font-mono)"
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
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          <Bar 
            dataKey="value" 
            radius={[6, 6, 0, 0]} 
            animationDuration={1200}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
