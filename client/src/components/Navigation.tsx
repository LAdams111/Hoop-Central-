import { Link, useLocation } from "wouter";
import { Search, Trophy, Home, Layers, Calendar, Users } from "lucide-react";

export function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Leagues", href: "/leagues" },
    { label: "Birth Year", href: "/classes" },
    { label: "Directory", href: "/players" },
  ];

  const mobileNavItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Leagues", href: "/leagues", icon: Layers },
    { label: "Birth Year", href: "/classes", icon: Calendar },
    { label: "Directory", href: "/players", icon: Users },
  ];

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group cursor-pointer">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center transform group-hover:rotate-12 transition-transform duration-300">
              <Trophy className="w-4 h-4 text-white" />
            </div>
            <span className="font-display text-2xl font-bold tracking-widest text-foreground group-hover:text-primary transition-colors">
              HOOP<span className="text-primary">CENTRAL</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-medium tracking-wide uppercase transition-colors hover:text-primary relative py-1 ${
                  location === item.href ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
                {item.label === "Home" && (
                  <div className="absolute bottom-0 left-0 w-full h-0.5 bg-primary" />
                )}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <Link href="/players">
              <button className="p-2 rounded-full hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors">
                <Search className="w-5 h-5" />
              </button>
            </Link>
          </div>
        </div>
      </header>

      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background/95 backdrop-blur-xl border-t border-border" data-testid="nav-mobile-bottom">
        <div className="flex items-center justify-around h-14">
          {mobileNavItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
                data-testid={`nav-mobile-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
