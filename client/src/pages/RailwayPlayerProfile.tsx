import { useRoute, Link } from "wouter";
import { useEffect, useState } from "react";
import { useRailwayPlayer } from "@/hooks/use-railway-player";
import { normalizeScraperPlayerDetail, type RailwayPlayerDetail, type RailwayStatRow } from "@/lib/railwayPlayer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Target, Activity, Trophy, Cloud, Flag } from "lucide-react";
import { DEFAULT_HEADSHOT, TEAM_ABBREV_TO_FULL, isCurrentNbaSeason, getCurrentNbaSeason, getCurrentNbaSeasonStartYear } from "@/lib/constants";

const RAILWAY_FAV_KEY = "player_favorites_railway";

/** Show season as YYYY-YY. Pass through existing range (e.g. "2024-25"); only expand bare year (e.g. "2025" → "2025-26"). */
function formatSeasonDisplay(season: string | null | undefined): string {
  const s = String(season ?? "").trim();
  if (!s) return "—";
  const rangeMatch = s.match(/^(\d{4})-(\d{2})$/);
  if (rangeMatch) return s; // already YYYY-YY, show as-is
  const bareYear = /^\d{4}$/.test(s) ? parseInt(s, 10) : null;
  if (bareYear != null) return `${bareYear}-${String(bareYear + 1).slice(-2)}`;
  return s;
}

function calculateAge(dob: string): number {
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

export default function RailwayPlayerProfile() {
  const [, params] = useRoute("/players/railway/:bbrefId");
  const bbrefId = params?.bbrefId ?? "";
  const { data: rawPlayer, isLoading, error } = useRailwayPlayer(bbrefId);

  const player: RailwayPlayerDetail | null =
    rawPlayer != null ? normalizeScraperPlayerDetail(rawPlayer) : null;

  const [isFavorited, setIsFavorited] = useState(false);
  useEffect(() => {
    const favs: string[] = JSON.parse(localStorage.getItem(RAILWAY_FAV_KEY) || "[]");
    setIsFavorited(favs.includes(bbrefId));
  }, [bbrefId]);

  const toggleFavorite = () => {
    const favs: string[] = JSON.parse(localStorage.getItem(RAILWAY_FAV_KEY) || "[]");
    const next = favs.includes(bbrefId) ? favs.filter((id) => id !== bbrefId) : [...favs, bbrefId];
    localStorage.setItem(RAILWAY_FAV_KEY, JSON.stringify(next));
    setIsFavorited(next.includes(bbrefId));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h2 className="font-display text-4xl">Player Not Found</h2>
        <p className="text-muted-foreground text-sm">{(error as Error)?.message}</p>
        <Link href="/players/railway">
          <Button variant="outline">Back to Scraper Players</Button>
        </Link>
      </div>
    );
  }

  const stats = player.stats ?? [];
  const seasonStartYear = (s: string) => {
    const m = String(s).trim().match(/^(\d{4})/);
    return m ? parseInt(m[1], 10) : 0;
  };
  const currentSeasonStr = getCurrentNbaSeason();
  const currentStartYear = getCurrentNbaSeasonStartYear();
  const withCurrent = stats.find((s) => (s.season ?? "") === currentSeasonStr || seasonStartYear(s.season ?? "") === currentStartYear);
  const latestSeason = withCurrent ?? [...stats].sort((a, b) => seasonStartYear(b.season ?? "") - seasonStartYear(a.season ?? ""))[0];
  const currentStats = {
    ppg: latestSeason?.pointsPerGame ?? "—",
    rpg: latestSeason?.reboundsPerGame ?? "—",
    apg: latestSeason?.assistsPerGame ?? "—",
    season: latestSeason?.season ?? "N/A",
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="relative min-h-[auto] md:min-h-[60vh] overflow-hidden border-b border-border pb-6 md:pb-12">
        <div className="absolute inset-0 bg-background/60 z-10" />
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 z-0 grayscale"
          style={{
            backgroundImage: `url(${player.headshotUrl?.startsWith("http") ? player.headshotUrl : (player.headshotUrl || DEFAULT_HEADSHOT)})`,
          }}
        />
        <div className="container mx-auto px-4 h-full relative z-20 flex flex-col justify-between py-8">
          <div className="flex items-center gap-2 mb-4">
            <Link href="/players/railway">
              <Button variant="outline" size="sm" className="rounded-full">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </Link>
            <Badge variant="secondary" className="font-mono text-xs">
              <Cloud className="w-3 h-3 mr-1" /> Railway
            </Badge>
          </div>

          <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-12">
            <div className="relative flex-shrink-0 z-30 mt-4 md:mt-0 md:mb-[-160px] md:-translate-y-[120px]">
              <div className="w-36 h-36 md:w-64 md:h-64 rounded-2xl overflow-hidden border-4 border-background shadow-2xl bg-muted">
                <img
                  src={player.headshotUrl || DEFAULT_HEADSHOT}
                  alt={player.name}
                  className="w-full h-full object-cover object-top"
                  onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                />
              </div>
              <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-primary text-white w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-lg font-display text-2xl md:text-3xl font-bold border-4 border-background shadow-lg">
                #{player.jerseyNumber}
              </div>
            </div>

            <div className="flex-1 pb-4 md:pb-8 pt-2 md:pt-0 flex flex-col justify-end items-center md:items-start">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4 md:mb-6 w-full">
                <div className="text-center md:text-left">
                  <h3 className="text-primary font-mono text-sm md:text-lg uppercase tracking-widest mb-1">{player.team}</h3>
                  <h1 className="font-display text-4xl md:text-8xl font-bold leading-[0.85] text-foreground tracking-tighter">
                    {player.name}
                  </h1>
                </div>
                <Button
                  variant={isFavorited ? "default" : "secondary"}
                  className={`w-full md:w-auto h-12 flex items-center justify-center gap-2 border-2 ${isFavorited ? "border-primary" : "border-border"} rounded-xl transition-all`}
                  onClick={toggleFavorite}
                >
                  <Flag className={`w-5 h-5 ${isFavorited ? "fill-current" : ""}`} />
                  <span className="font-display font-bold uppercase tracking-tight">Favorite</span>
                </Button>
              </div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-4 text-xs md:text-sm text-foreground/60 font-mono mt-3">
                <Badge variant="outline" className="text-foreground border-border px-4 py-1">{player.position}</Badge>
                <span className="px-3 py-1 bg-muted rounded-full border border-border">
                  <span className="text-primary font-bold">HT</span> {player.height}
                </span>
                <span className="px-3 py-1 bg-muted rounded-full border border-border">
                  <span className="text-primary font-bold">WT</span> {player.weight && player.weight !== "—" ? `${player.weight} lbs` : (player.weight ?? "—")}
                </span>
                {player.birthDate && (
                  <>
                    <span className="px-3 py-1 bg-muted rounded-full border border-border">
                      <span className="text-primary font-bold">AGE</span> {calculateAge(player.birthDate)}
                    </span>
                    <span className="px-3 py-1 bg-muted rounded-full border border-border">
                      <span className="text-primary font-bold">DOB</span>{" "}
                      {new Date(player.birthDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </>
                )}
              </div>
              {player.hometown && (
                <div className="flex items-center gap-2 px-4 py-3 bg-primary/5 rounded-xl border border-primary/20 w-fit mt-3">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-primary/70 font-bold">Hometown</span>
                  <span className="text-lg text-foreground font-mono font-bold">{player.hometown}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-16">
        <div className="grid grid-cols-1 gap-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1">
              <section className="bg-card rounded-2xl p-6 border border-border shadow-xl h-full">
                <h3 className="font-display text-2xl mb-4 border-b border-border pb-2">{isCurrentNbaSeason(currentStats.season) ? "Current Season" : "Most Recent Season"} ({formatSeasonDisplay(currentStats.season)})</h3>
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
            {player.bio && (
              <div className="lg:col-span-2">
                <section className="bg-card rounded-2xl p-6 border border-border shadow-xl h-full">
                  <h3 className="font-display text-2xl mb-4 border-b border-border pb-2">Bio</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{player.bio}</p>
                </section>
              </div>
            )}
          </div>

          {stats.length > 0 && (
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
                    {stats.map((row: RailwayStatRow, i: number) => (
                      <tr key={i} className="hover:bg-muted/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-medium">{formatSeasonDisplay(row.season)}</td>
                        <td className="px-6 py-4 font-mono text-muted-foreground">{row.league ?? "—"}</td>
                        <td className="px-6 py-4 font-mono">{TEAM_ABBREV_TO_FULL[row.team ?? ""] ?? row.team ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{row.gamesPlayed ?? "—"}</td>
                        <td className="px-6 py-4 font-bold text-foreground">{row.pointsPerGame ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{row.reboundsPerGame ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{row.assistsPerGame ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{row.blocksPerGame ?? "—"}</td>
                        <td className="px-6 py-4 text-muted-foreground">{row.stealsPerGame ?? "—"}</td>
                        <td className="px-6 py-4 font-mono text-accent">{row.fieldGoalPct != null ? `${row.fieldGoalPct}%` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
