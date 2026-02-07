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
      <div className="relative h-[60vh] md:h-[50vh] overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-background/60 z-10" />
        
        {/* Background Image (blurred) */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10 z-0 grayscale"
          style={{ backgroundImage: `url(${player.headshotUrl})` }}
        />
        
        <div className="container mx-auto px-4 h-full relative z-20 flex flex-col justify-between py-8">
          <Link href="/">
            <Button variant="ghost" className="text-foreground/60 hover:text-foreground w-fit -ml-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Button>
          </Link>

          <div className="flex flex-col md:flex-row items-end gap-8 md:gap-12">
            {/* Player Image */}
            <div className="relative flex-shrink-0 z-30 mb-[-120px] md:mb-[-160px] -translate-y-[120px] md:-translate-y-[160px]">
              <div className="w-48 h-48 md:w-64 md:h-64 rounded-2xl overflow-hidden border-4 border-background shadow-2xl bg-muted">
                <img 
                  src={player.headshotUrl} 
                  alt={player.name} 
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <div className="absolute -top-4 -right-4 bg-primary text-white w-16 h-16 flex items-center justify-center rounded-lg font-display text-3xl font-bold border-4 border-background shadow-lg">
                #{player.jerseyNumber}
              </div>
            </div>

            {/* Player Info */}
            <div className="flex-1 pb-4 md:pb-8 pt-8 md:pt-0 min-h-[160px] md:min-h-0 flex flex-col justify-end">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-primary font-mono text-lg uppercase tracking-widest mb-1">{player.team}</h3>
                  <h1 className="font-display text-6xl md:text-8xl font-bold leading-none text-foreground tracking-tighter">
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

              <div className="flex flex-col gap-6">
                <div className="flex flex-wrap items-center gap-4 text-sm text-foreground/60 font-mono">
                  <Badge variant="outline" className="text-foreground border-border px-4 py-1">
                    {player.position}
                  </Badge>
                  <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                    <span className="text-primary">HT</span> {player.height}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                    <span className="text-primary">WT</span> {player.weight}
                  </div>
                  {player.birthDate && (
                    <>
                      <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                        <span className="text-primary">AGE</span> {calculateAge(player.birthDate)}
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                        <span className="text-primary">DOB</span> {new Date(player.birthDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </>
                  )}
                </div>

                {player.hometown && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 rounded-xl border border-primary/20 w-fit">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-bold leading-none mb-2">Hometown</span>
                      <span className="text-lg text-foreground font-mono font-bold">{player.hometown}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CONTENT GRID */}
      <div className="container mx-auto px-4 mt-32 md:mt-40">
        <div className="grid grid-cols-1 gap-8">
          
          <div className="flex justify-center">
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
          {(player as any).awards && (player as any).awards.length > 0 && (
            <section className="bg-card rounded-2xl border border-border overflow-hidden shadow-xl">
              <div className="p-6 border-b border-border">
                <h3 className="font-display text-2xl">Awards & Achievements</h3>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(player as any).awards.map((award: any) => (
                  <div key={award.id} className="flex items-center gap-4 p-4 bg-muted rounded-xl border border-border">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                      <Trophy className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-bold text-foreground">{award.name}</div>
                      <div className="text-sm font-mono text-muted-foreground">{award.year}</div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
