import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Download, Loader2, CheckCircle, AlertCircle, History, Zap, UserCheck, Globe } from "lucide-react";

interface ScrapeResult {
  playersAdded: number;
  playersUpdated: number;
  statsUpdated: number;
  bioMatches: number;
  wikiFallbacks: number;
  seasonsScraped: number;
  errors: string[];
  season: string;
}

export default function Scraper() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runNBAScraper = async (fullHistory: boolean) => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch("/api/scraper/nba", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullHistory }),
      });
      if (res.status === 409) {
        setError("Scraper is already running. Please wait for it to finish.");
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Scraper failed");
        return;
      }
      const data: ScrapeResult = await res.json();
      setResult(data);
    } catch (err: any) {
      setError(err.message || "Failed to connect to scraper");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="bg-muted border-b border-border py-12">
        <div className="container mx-auto px-4">
          <Button variant="outline" size="sm" className="rounded-full mb-8" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <h1 className="font-display text-5xl md:text-7xl font-bold tracking-tighter uppercase" data-testid="text-page-title">
            Data Scraper
          </h1>
          <p className="text-muted-foreground text-sm max-w-2xl mt-2">
            Fetch real player data, stats, and personal details from multiple sources.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 mt-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold uppercase tracking-tight" data-testid="text-nba-scraper">NBA Current</h2>
                <p className="text-xs text-muted-foreground font-mono">2025-26 Season</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Fetches all current NBA players with this season's stats. Enriches player profiles with real height, weight, DOB, and jersey numbers from Wikidata and Wikipedia.
            </p>
            <Button
              onClick={() => runNBAScraper(false)}
              disabled={running}
              className="w-full"
              data-testid="button-run-nba-scraper"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Current Season
                </>
              )}
            </Button>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <History className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h2 className="font-display text-2xl font-bold uppercase tracking-tight" data-testid="text-full-history">Full History</h2>
                <p className="text-xs text-muted-foreground font-mono">2002-03 to Present</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Fetches all NBA seasons from 2002-03 through today. Gives every player their full career stats history. Takes several minutes.
            </p>
            <Button
              onClick={() => runNBAScraper(true)}
              disabled={running}
              variant="outline"
              className="w-full"
              data-testid="button-run-full-history"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scraping History...
                </>
              ) : (
                <>
                  <History className="w-4 h-4 mr-2" />
                  Full Career History
                </>
              )}
            </Button>
          </Card>
        </div>

        {running && (
          <Card className="mt-8 p-6 max-w-4xl border-primary/30">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <div>
                <p className="font-medium">Scraper is running...</p>
                <p className="text-sm text-muted-foreground">Fetching player data, stats, and enriching profiles from Wikidata + Wikipedia. This may take a few minutes.</p>
              </div>
            </div>
          </Card>
        )}

        {error && (
          <Card className="mt-8 p-6 max-w-4xl border-destructive/30">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <div>
                <p className="font-medium text-destructive">Scraper Error</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          </Card>
        )}

        {result && (
          <Card className="mt-8 p-6 max-w-4xl border-green-500/30" data-testid="card-scrape-result">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              <p className="font-medium text-green-500">Scrape Complete</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
              <div className="bg-background rounded-lg p-4 text-center border border-border">
                <div className="font-display text-3xl font-bold" data-testid="text-players-added">{result.playersAdded}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">New Players</div>
              </div>
              <div className="bg-background rounded-lg p-4 text-center border border-border">
                <div className="font-display text-3xl font-bold" data-testid="text-players-updated">{result.playersUpdated}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Updated</div>
              </div>
              <div className="bg-background rounded-lg p-4 text-center border border-border">
                <div className="font-display text-3xl font-bold" data-testid="text-stats-updated">{result.statsUpdated}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Stat Lines</div>
              </div>
              <div className="bg-background rounded-lg p-4 text-center border border-border">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <UserCheck className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="font-display text-3xl font-bold" data-testid="text-bio-matches">{result.bioMatches}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Wikidata Bios</div>
              </div>
              <div className="bg-background rounded-lg p-4 text-center border border-border">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="font-display text-3xl font-bold" data-testid="text-wiki-fallbacks">{result.wikiFallbacks}</div>
                <div className="text-xs text-muted-foreground uppercase tracking-widest">Wikipedia Fills</div>
              </div>
              {result.seasonsScraped > 1 && (
                <div className="bg-background rounded-lg p-4 text-center border border-border">
                  <div className="font-display text-3xl font-bold" data-testid="text-seasons-scraped">{result.seasonsScraped}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-widest">Seasons</div>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground font-mono mb-2">{result.errors.length} warning(s):</p>
                <div className="max-h-32 overflow-y-auto text-xs text-muted-foreground font-mono space-y-1">
                  {result.errors.slice(0, 10).map((err, i) => (
                    <p key={i}>{err}</p>
                  ))}
                  {result.errors.length > 10 && (
                    <p>...and {result.errors.length - 10} more</p>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
