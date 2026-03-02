import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import { Search, Trophy, Home, Layers, Calendar, Users, Flame, Lock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function Navigation() {
  const [location] = useLocation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      setIsAdmin(false);
      return;
    }
    fetch("/api/admin/check", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated) setIsAdmin(true);
        else {
          setIsAdmin(false);
          localStorage.removeItem("admin_token");
        }
      })
      .catch(() => {
        setIsAdmin(false);
        localStorage.removeItem("admin_token");
      });
  }, []);

  const handleAdminLogout = () => {
    localStorage.removeItem("admin_token");
    setIsAdmin(false);
  };

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Leagues", href: "/leagues" },
    { label: "Prospects", href: "/prospects" },
    { label: "Birth Year", href: "/classes" },
    { label: "Directory", href: "/players" },
  ];

  const mobileNavItems = [
    { label: "Home", href: "/", icon: Home },
    { label: "Leagues", href: "/leagues", icon: Layers },
    { label: "Prospects", href: "/prospects", icon: Flame },
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
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-card border-primary/30 text-primary px-2 py-0.5 text-xs">
                  <Lock className="w-3 h-3 mr-1" /> Admin
                </Badge>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground text-xs"
                  onClick={handleAdminLogout}
                  data-testid="button-nav-admin-logout"
                >
                  <LogOut className="w-3 h-3 mr-1" /> Logout
                </Button>
              </div>
            )}
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
