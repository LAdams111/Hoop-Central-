import { useRoute } from "wouter";
import { usePlayer } from "@/hooks/use-players";
import { StatsChart } from "@/components/StatsChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  Trophy, 
  Target, 
  Activity, 
  TrendingUp, 
  Share2,
  Eye
} from "lucide-react";
import { Link } from "wouter";

export default function PlayerProfile() {
  const [, params] = useRoute("/players/:id");
  const id = parseInt(params?.id || "0");
  const { data: player, isLoading } = usePlayer(id);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="font-display text-4xl">Player Not Found</h2>
        <Link href="/players">
          <Button>Return to Directory</Button>
        </Link>
      </div>
    );
  }

  // Calculate career averages
  const totalStats = player.stats.reduce((acc, curr) => ({
    games: acc.games + curr.gamesPlayed,
    ppg: acc.ppg + parseFloat(curr.pointsPerGame),
    rpg: acc.rpg + parseFloat(curr.reboundsPerGame),
    apg: acc.apg + parseFloat(curr.assistsPerGame)
  }), { games: 0, ppg: 0, rpg: 0, apg: 0 });

  const seasonCount = player.stats.length || 1;
  const careerStats = {
    ppg: (totalStats.ppg / seasonCount).toFixed(1),
    rpg: (totalStats.rpg / seasonCount).toFixed(1),
    apg: (totalStats.apg / seasonCount).toFixed(1),
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* HEADER SECTION */}
      <div className="relative h-[60vh] md:h-[50vh] overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-background/90 z-10" />
        
        {/* Background Image (blurred) */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-30 z-0 grayscale"
          style={{ backgroundImage: `url(${player.headshotUrl})` }}
        />
        
        <div className="container mx-auto px-4 h-full relative z-20 flex flex-col justify-between py-8">
          <Link href="/players">
            <Button variant="ghost" className="text-white/60 hover:text-white w-fit -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Directory
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row items-end gap-8 md:gap-12">
            {/* Player Image */}
            <div className="relative -mb-16 md:-mb-24 flex-shrink-0 z-30">
              <div className="w-48 h-48 md:w-64 md:h-64 rounded-2xl overflow-hidden border-4 border-background shadow-2xl">
                <img 
                  src={player.headshotUrl} 
                  alt={player.name} 
                  className="w-full h-full object-cover bg-muted"
                />
              </div>
              <div className="absolute -top-6 -right-6 bg-primary text-white w-16 h-16 flex items-center justify-center rounded-full font-display text-3xl font-bold border-4 border-background shadow-lg rotate-12">
                #{player.jerseyNumber}
              </div>
            </div>

            {/* Player Info */}
            <div className="flex-1 pb-4 md:pb-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-primary font-mono text-lg uppercase tracking-widest mb-1">{player.team}</h3>
                  <h1 className="font-display text-6xl md:text-8xl font-bold leading-none text-white tracking-tighter">
                    {player.name}
                  </h1>
                </div>
                <div className="flex gap-3">
                  <Button variant="secondary" size="icon" className="rounded-full">
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button className="rounded-full">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Compare
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-white/60 font-mono">
                <Badge variant="outline" className="text-white border-white/20 px-4 py-1">
                  {player.position}
                </Badge>
                <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                  <span className="text-primary">HT</span> {player.height}
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5">
                  <span className="text-primary">WT</span> {player.weight}
                </div>
                {player.hometown && (
                  <div className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-primary/20 ml-4">
                    <span className="text-primary">HOME</span> {player.hometown}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="container mx-auto px-4 mt-24 md:mt-32">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Bio & Quick Stats */}
          <div className="space-y-8">
            <section className="bg-card rounded-2xl p-6 border border-white/5 shadow-xl">
              <h3 className="font-display text-2xl mb-4 border-b border-white/5 pb-2">About</h3>
              <p className="text-muted-foreground leading-relaxed">
                {player.bio || `${player.name} plays for the ${player.team} as a ${player.position}. Standing at ${player.height} and weighing ${player.weight}, they are a key contributor to the team's rotation.`}
              </p>
            </section>

            <section className="grid grid-cols-2 gap-4">
               <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-xl text-center">
                 <Target className="w-6 h-6 text-primary mx-auto mb-2 opacity-80" />
                 <div className="font-display text-4xl">{careerStats.ppg}</div>
                 <div className="text-xs text-muted-foreground uppercase tracking-widest">Career PPG</div>
               </div>
               <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-xl text-center">
                 <Activity className="w-6 h-6 text-accent mx-auto mb-2 opacity-80" />
                 <div className="font-display text-4xl">{careerStats.apg}</div>
                 <div className="text-xs text-muted-foreground uppercase tracking-widest">Career APG</div>
               </div>
               <div className="bg-card rounded-2xl p-6 border border-white/5 shadow-xl text-center col-span-2">
                 <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2 opacity-80" />
                 <div className="font-display text-4xl">{careerStats.rpg}</div>
                 <div className="text-xs text-muted-foreground uppercase tracking-widest">Career RPG</div>
               </div>
            </section>
          </div>

          {/* Right Column: Charts & History */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Charts Grid */}
            <div className="mb-4 flex items-center gap-2 text-muted-foreground bg-white/5 w-fit px-3 py-1 rounded-full border border-white/5">
              <Eye className="w-4 h-4 text-primary" />
              <span className="font-mono text-xs uppercase tracking-wider">{player.profileViews} Profile Views</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <StatsChart stats={player.stats} dataKey="pointsPerGame" label="Points" color="hsl(var(--primary))" />
              <StatsChart stats={player.stats} dataKey="assistsPerGame" label="Assists" color="hsl(var(--accent))" />
            </div>

            {/* Season Table */}
            <section className="bg-card rounded-2xl border border-white/5 overflow-hidden shadow-xl">
              <div className="p-6 border-b border-white/5">
                <h3 className="font-display text-2xl">Season History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-white/5 text-xs uppercase font-mono text-muted-foreground">
                    <tr>
                      <th className="px-6 py-4 font-medium">Season</th>
                      <th className="px-6 py-4 font-medium">Team</th>
                      <th className="px-6 py-4 font-medium">GP</th>
                      <th className="px-6 py-4 font-medium text-primary">PTS</th>
                      <th className="px-6 py-4 font-medium">REB</th>
                      <th className="px-6 py-4 font-medium">AST</th>
                      <th className="px-6 py-4 font-medium">BLK</th>
                      <th className="px-6 py-4 font-medium">STL</th>
                      <th className="px-6 py-4 font-medium">FG%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {[...player.stats].sort((a, b) => b.season.localeCompare(a.season)).map((stat) => (
                      <tr key={stat.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium">{stat.season}</td>
                        <td className="px-6 py-4 uppercase font-mono">
                          <Link href={`/roster/${stat.team}/${stat.season}`}>
                            <Button variant="ghost" className="p-0 h-auto text-primary hover:text-primary/80">
                              {stat.team}
                            </Button>
                          </Link>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">{stat.gamesPlayed}</td>
                        <td className="px-6 py-4 font-bold text-foreground">{stat.pointsPerGame}</td>
                        <td className="px-6 py-4 text-muted-foreground">{stat.reboundsPerGame}</td>
                        <td className="px-6 py-4 text-muted-foreground">{stat.assistsPerGame}</td>
                        <td className="px-6 py-4 text-muted-foreground">{stat.blocksPerGame}</td>
                        <td className="px-6 py-4 text-muted-foreground">{stat.stealsPerGame}</td>
                        <td className="px-6 py-4 font-mono text-accent">{stat.fieldGoalPct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  );
}
