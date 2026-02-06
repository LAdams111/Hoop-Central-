import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy, Users, Star, School, Medal } from "lucide-react";

const LEAGUES = [
  {
    name: "NBA",
    tier: "Tier 1: Professional (Top)",
    description: "The National Basketball Association - the premier professional basketball league in the world.",
    icon: Trophy,
    color: "text-primary",
    bgColor: "bg-primary/10"
  },
  {
    name: "NBA G League",
    tier: "Tier 2: Professional (Developmental)",
    description: "The official minor league organization of the NBA.",
    icon: Activity,
    color: "text-accent",
    bgColor: "bg-accent/10"
  },
  {
    name: "NCAA Division I",
    tier: "Tier 3: Collegiate",
    description: "The highest level of intercollegiate athletics sanctioned by the NCAA.",
    icon: School,
    color: "text-blue-600",
    bgColor: "bg-blue-50"
  },
  {
    name: "Overtime Elite (OTE)",
    tier: "Tier 4: Professional / Youth",
    description: "A professional basketball league for late-stage high school and early college-level players.",
    icon: Star,
    color: "text-yellow-600",
    bgColor: "bg-yellow-50"
  },
  {
    name: "High School / AAU",
    tier: "Tier 5: Amateur / Youth",
    description: "Premier competitive circuit for high school athletes and independent club teams.",
    icon: Users,
    color: "text-muted-foreground",
    bgColor: "bg-muted"
  }
];

import { Activity } from "lucide-react";

export default function Leagues() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-12">
        <h1 className="font-display text-5xl font-bold mb-4">Leagues</h1>
        <p className="text-muted-foreground text-lg">North American basketball hierarchy from professional to youth levels.</p>
      </div>

      <div className="space-y-6">
        {LEAGUES.map((league, index) => (
          <Card key={league.name} className="overflow-hidden border-border hover:border-primary/50 transition-all">
            <div className="flex flex-col md:flex-row items-center p-6 gap-6">
              <div className={`w-16 h-16 rounded-2xl ${league.bgColor} flex items-center justify-center ${league.color} flex-shrink-0 shadow-sm border border-border/50`}>
                <league.icon className="w-8 h-8" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="text-xs font-mono text-primary uppercase tracking-widest mb-1">{league.tier}</div>
                <CardTitle className="font-display text-3xl mb-2">{league.name}</CardTitle>
                <p className="text-muted-foreground text-sm max-w-2xl">{league.description}</p>
              </div>
              <div className="flex-shrink-0 bg-muted px-4 py-2 rounded-xl border border-border">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">Status</div>
                <div className="text-sm font-mono text-foreground">Active Circuit</div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
