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
        <Link href="/">
          <Button>Return to Home</Button>
        </Link>
      </div>
    );
  }

  const latestSeason = [...player.stats].sort((a, b) => b.season.localeCompare(a.season))[0];
  const currentStats = {
    ppg: latestSeason?.pointsPerGame || "0.0",
    rpg: latestSeason?.reboundsPerGame || "0.0",
    apg: latestSeason?.assistsPerGame || "0.0",
    season: latestSeason?.season || "N/A"
  };

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* HEADER SECTION */}
      <div className="relative min-h-[60vh] md:min-h-[55vh] overflow-hidden border-b border-border/40 pb-16 bg-muted/20">
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background z-10" />
        
        {/* Background Image (subtle movement/texture) */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-5 z-0 grayscale scale-110 blur-sm"
          style={{ backgroundImage: `url(${player.headshotUrl})` }}
        />
        
        <div className="container mx-auto px-4 h-full relative z-20 flex flex-col justify-between py-10">
          <Link href="/">
            <Button variant="ghost" className="text-foreground/40 hover:text-primary w-fit -ml-4 mb-8 font-mono text-xs tracking-widest uppercase">
              <ArrowLeft className="w-3.5 h-3.5 mr-2" />
              Directory
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row items-end gap-10 md:gap-16">
            {/* Player Image */}
            <div className="relative flex-shrink-0 z-30 mb-[-120px] md:mb-[-140px]">
              <div className="w-56 h-56 md:w-72 md:h-72 rounded-[2rem] overflow-hidden border-8 border-background shadow-[0_32px_64px_-12px_rgba(0,0,0,0.15)] bg-white">
                <img 
                  src={player.headshotUrl} 
                  alt={player.name} 
                  className="w-full h-full object-cover object-top transition-transform duration-700 hover:scale-110"
                />
              </div>
              <div className="absolute -top-6 -right-6 bg-primary text-white w-20 h-20 flex items-center justify-center rounded-2xl font-display text-4xl font-bold border-8 border-background shadow-2xl transform rotate-3">
                #{player.jerseyNumber}
              </div>
            </div>

            {/* Player Info */}
            <div className="flex-1 pb-4 md:pb-6 flex flex-col justify-end">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                <div>
                  <Link href={`/roster/${encodeURIComponent(player.team)}/2023-24`}>
                    <Button variant="ghost" className="p-0 h-auto group">
                      <h3 className="text-primary font-mono text-xl uppercase tracking-[0.3em] mb-3 group-hover:tracking-[0.4em] transition-all duration-300 font-bold">{player.team}</h3>
                    </Button>
                  </Link>
                  <h1 className="font-display text-7xl md:text-9xl font-bold leading-none text-foreground tracking-tighter uppercase">
                    {player.name}
                  </h1>
                </div>
                <div className="flex gap-4">
                  <Button variant="outline" size="icon" className="rounded-2xl border-border/60 hover:border-primary hover:bg-primary/5 transition-all">
                    <Share2 className="w-4 h-4" />
                  </Button>
                  <Button className="rounded-2xl shadow-xl shadow-primary/20 h-12 px-8">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Compare Analytics
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-8">
                <div className="flex flex-wrap items-center gap-6 text-sm text-foreground/60 font-mono">
                  <Badge variant="outline" className="text-foreground border-primary/20 bg-primary/5 px-6 py-2 rounded-xl font-bold tracking-widest">
                    {player.position}
                  </Badge>
                  <div className="flex items-center gap-3 px-5 py-2 bg-white/50 backdrop-blur-sm rounded-xl border border-border/40 shadow-sm">
                    <span className="text-primary/60 font-bold tracking-tighter">HT</span> 
                    <span className="font-bold text-foreground">{player.height}</span>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-2 bg-white/50 backdrop-blur-sm rounded-xl border border-border/40 shadow-sm">
                    <span className="text-primary/60 font-bold tracking-tighter">WT</span> 
                    <span className="font-bold text-foreground">{player.weight}</span>
                  </div>
                  {player.birthDate && (
                    <>
                      <div className="flex items-center gap-3 px-5 py-2 bg-white/50 backdrop-blur-sm rounded-xl border border-border/40 shadow-sm">
                        <span className="text-primary/60 font-bold tracking-tighter">AGE</span> 
                        <span className="font-bold text-foreground">{calculateAge(player.birthDate)}</span>
                      </div>
                      <div className="flex items-center gap-3 px-5 py-2 bg-white/50 backdrop-blur-sm rounded-xl border border-border/40 shadow-sm">
                        <span className="text-primary/60 font-bold tracking-tighter">DOB</span> 
                        <span className="font-bold text-foreground">{new Date(player.birthDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </>
                  )}
                </div>

                {player.hometown && (
                  <div className="flex items-center gap-4 px-6 py-4 bg-white/80 backdrop-blur-md rounded-[1.25rem] border border-border/40 w-fit shadow-sm">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.3em] text-primary font-black leading-none mb-3">Origin</span>
                      <span className="text-xl text-foreground font-display font-bold uppercase tracking-tight">{player.hometown}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="container mx-auto px-4 mt-16">
        <div className="grid grid-cols-1 gap-8">
          
          <div className="flex justify-center -mb-4">
            <div className="flex items-center gap-3 text-muted-foreground bg-card w-fit px-6 py-3 rounded-2xl border border-border shadow-sm">
              <Eye className="w-6 h-6 text-primary" />
              <span className="font-display text-2xl uppercase tracking-wider font-bold">{player.profileViews} Profile Views</span>
            </div>
          </div>

          {/* Top Row: Quick Stats & Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <section className="bg-card rounded-2xl p-6 border border-border shadow-xl h-full">
                <h3 className="font-display text-2xl mb-4 border-b border-border pb-2">Current Season ({currentStats.season})</h3>
                <div className="grid grid-cols-2 gap-4">
                   <div className="bg-background rounded-xl p-4 border border-border text-center">
                     <Target className="w-6 h-6 text-primary mx-auto mb-2 opacity-80" />
                     <div className="font-display text-4xl">{currentStats.ppg}</div>
                     <div className="text-[10px] text-muted-foreground uppercase tracking-widest">PPG</div>
                   </div>
                   <div className="bg-background rounded-xl p-4 border border-border text-center">
                     <Activity className="w-6 h-6 text-accent mx-auto mb-2 opacity-80" />
                     <div className="font-display text-4xl">{currentStats.apg}</div>
                     <div className="text-[10px] text-muted-foreground uppercase tracking-widest">APG</div>
                   </div>
                   <div className="bg-background rounded-xl p-4 border border-border text-center col-span-2">
                     <Trophy className="w-6 h-6 text-yellow-500 mx-auto mb-2 opacity-80" />
                     <div className="font-display text-4xl">{currentStats.rpg}</div>
                     <div className="text-[10px] text-muted-foreground uppercase tracking-widest">RPG</div>
                   </div>
                </div>
              </section>
            </div>

            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatsChart stats={player.stats} dataKey="pointsPerGame" label="Points" color="hsl(var(--primary))" />
                <StatsChart stats={player.stats} dataKey="assistsPerGame" label="Assists" color="hsl(var(--accent))" />
              </div>
            </div>
          </div>

          {/* Season History: Full Width */}
          <section className="bg-card rounded-2xl border border-border overflow-hidden shadow-xl">
            <div className="p-6 border-b border-border">
              <h3 className="font-display text-2xl">Season History</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted text-xs uppercase font-mono text-muted-foreground">
                  <tr>
                    <th className="px-6 py-4 font-medium">Season</th>
                    <th className="px-6 py-4 font-medium">League</th>
                    <th className="px-6 py-4 font-medium">Team</th>
                    <th className="px-6 py-4 font-medium">GP</th>
                    <th className="px-6 py-4 font-medium text-primary">PTS</th>
                    <th className="px-6 py-4 font-medium">REB</th>
                    <th className="px-6 py-4 font-medium text-accent">AST</th>
                    <th className="px-6 py-4 font-medium">BLK</th>
                    <th className="px-6 py-4 font-medium">STL</th>
                    <th className="px-6 py-4 font-medium text-yellow-600">FG%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[...player.stats].sort((a, b) => b.season.localeCompare(a.season)).map((stat) => (
                    <tr key={stat.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4 font-mono font-medium">{stat.season}</td>
                      <td className="px-6 py-4 font-mono text-muted-foreground whitespace-nowrap">{stat.league || "NBA"}</td>
                      <td className="px-6 py-4 uppercase font-mono">
                        <Link href={`/roster/${stat.team}/${stat.season}`}>
                          <Button variant="ghost" className="p-0 h-auto text-primary hover:text-primary/80 whitespace-nowrap">
                            {stat.team}
                          </Button>
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-base text-muted-foreground">{stat.gamesPlayed}</td>
                      <td className="px-6 py-4 text-base font-bold text-foreground">{stat.pointsPerGame}</td>
                      <td className="px-6 py-4 text-base text-muted-foreground">{stat.reboundsPerGame}</td>
                      <td className="px-6 py-4 text-base text-muted-foreground">{stat.assistsPerGame}</td>
                      <td className="px-6 py-4 text-base text-muted-foreground">{stat.blocksPerGame}</td>
                      <td className="px-6 py-4 text-base text-muted-foreground">{stat.stealsPerGame}</td>
                      <td className="px-6 py-4 text-base font-mono text-accent">{stat.fieldGoalPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Awards & Achievements Section */}
          <section className="bg-card rounded-2xl border border-border overflow-hidden shadow-xl">
            <div className="p-6 border-b border-border">
              <h3 className="font-display text-2xl">Awards & Achievements</h3>
            </div>
            <div className="p-6">
              {(player as any).awards && (player as any).awards.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Object.entries(
                    (player as any).awards.reduce((acc: any, award: any) => {
                      if (!acc[award.name]) {
                        acc[award.name] = [];
                      }
                      acc[award.name].push(award.year);
                      return acc;
                    }, {})
                  ).map(([name, years]: [string, any]) => (
                    <div key={name} className="flex items-center gap-4 p-4 bg-muted rounded-xl border border-border">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold text-foreground">{name}</div>
                        <div className="text-sm font-mono text-muted-foreground">
                          {years.sort().join(', ')}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-xl">
                  <Trophy className="w-12 h-12 mb-4 opacity-20" />
                  <p className="font-display text-xl uppercase tracking-wider">No awards recorded yet</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
