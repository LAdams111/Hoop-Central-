import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navigation } from "@/components/Navigation";
import Home from "@/pages/Home";
import Leagues from "@/pages/Leagues";
import LeagueDetail from "@/pages/LeagueDetail";
import Classes from "@/pages/Classes";
import PlayerDirectory from "@/pages/PlayerDirectory";
import PlayerProfile from "@/pages/PlayerProfile";
import TeamRoster from "@/pages/Roster";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/leagues" component={Leagues} />
      <Route path="/leagues/:league" component={LeagueDetail} />
      <Route path="/classes" component={Classes} />
      <Route path="/players" component={PlayerDirectory} />
      <Route path="/players/:id" component={PlayerProfile} />
      <Route path="/roster/:team/:season" component={TeamRoster} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen bg-background text-foreground font-body pb-16 md:pb-0">
          <Navigation />
          <Router />
          <Toaster />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
