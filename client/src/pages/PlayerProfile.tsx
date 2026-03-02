import { useRoute, useLocation } from "wouter";
import { useEffect, useState, useRef, useCallback } from "react";
import { usePlayer } from "@/hooks/use-players";
import { api } from "@shared/routes";
import { StatsChart } from "@/components/StatsChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DEFAULT_HEADSHOT, TEAM_ABBREV_TO_FULL, isCurrentNbaSeason } from "@/lib/constants";
import { isPlayerFavorited, togglePlayerFavorite } from "@/lib/favorites";
import { useUpload } from "@/hooks/use-upload";
import { 
  ArrowLeft, 
  Trophy, 
  Target, 
  Activity, 
  Eye,
  Flag,
  Camera,
  Lock,
  Upload,
  Loader2,
  X,
  Pencil,
  Save,
  Check
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

/** Show season as YYYY-YY (e.g. 1988 → 1987-88). */
function formatSeasonDisplay(season: string): string {
  const s = String(season || "").trim();
  if (/^\d{4}$/.test(s)) {
    const y = parseInt(s, 10);
    return `${y - 1}-${String(y).slice(-2)}`;
  }
  return s;
}

/** True if this stat row is a combined/total row (e.g. team "2", "3", "TOT") — do not display in Season History. */
function isCombinedStatRow(stat: { team?: string | number | null }): boolean {
  const t = String(stat?.team ?? "").trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) return true; // "2", "3" = number of teams
  if (/^TOT$/i.test(t)) return true;
  return false;
}

export default function PlayerProfile() {
  const [, params] = useRoute("/players/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ?? "";
  const { data: player, isLoading } = usePlayer(id);
  const [isFavorited, setIsFavorited] = useState(() => isPlayerFavorited(id));
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState("");
  const [isUploadingHeadshot, setIsUploadingHeadshot] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "", position: "", team: "", height: "", weight: "",
    jerseyNumber: 0, bio: "", hometown: "", birthDate: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileViewsInput, setProfileViewsInput] = useState("");
  const [savingProfileViews, setSavingProfileViews] = useState(false);
  /** After admin saves, this overrides the displayed count so the UI updates even if refetch/cache doesn't. */
  const [displayedProfileViews, setDisplayedProfileViews] = useState<number | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((d) => { if (d.authenticated) setIsAdmin(true); else localStorage.removeItem("admin_token"); })
        .catch(() => localStorage.removeItem("admin_token"));
    }
  }, []);

  useEffect(() => {
    if (player?.profileViews != null) setProfileViewsInput(String(player.profileViews));
  }, [player?.profileViews]);

  useEffect(() => {
    setDisplayedProfileViews(null);
  }, [id]);

  const handleAdminLogin = async () => {
    setAdminError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem("admin_token", data.token);
        setIsAdmin(true);
        setShowAdminLogin(false);
        setAdminPassword("");
      } else {
        setAdminError("Wrong password");
      }
    } catch {
      setAdminError("Login failed");
    }
  };

  const saveProfileViews = async () => {
    if (!player?.id) return;
    const value = parseInt(profileViewsInput.trim(), 10);
    if (Number.isNaN(value) || value < 0) {
      toast({ title: "Invalid number", description: "Enter a non-negative number.", variant: "destructive" });
      return;
    }
    setSavingProfileViews(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`/api/players/${player.id}/profile-views`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ profileViews: value }),
      });
      if (res.status === 401) {
        toast({ title: "Session expired", description: "Please log in as admin again (lock icon below).", variant: "destructive" });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string })?.error ?? "Update failed";
        toast({ title: msg, variant: "destructive" });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; profileViews?: number };
      const newViews = typeof data.profileViews === "number" ? data.profileViews : value;
      setDisplayedProfileViews(newViews);
      queryClient.setQueryData(
        [api.players.get.path, String(player.id)],
        (prev: unknown) =>
          prev && typeof prev === "object" && "profileViews" in prev
            ? { ...(prev as Record<string, unknown>), profileViews: newViews }
            : prev
      );
      setProfileViewsInput(String(newViews));
      toast({ title: "Profile views updated", description: `Set to ${newViews}.` });
    } catch {
      toast({ title: "Update failed", description: "Network or server error.", variant: "destructive" });
    } finally {
      setSavingProfileViews(false);
    }
  };

  const handleHeadshotUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingHeadshot(true);
    try {
      const token = localStorage.getItem("admin_token");
      const urlRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      const { uploadURL, objectPath } = await urlRes.json();
      await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      await fetch(`/api/players/${id}/headshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ objectPath }),
      });
      queryClient.invalidateQueries({ queryKey: [api.players.get.path, id] });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploadingHeadshot(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const startEditing = () => {
    if (!player) return;
    setEditForm({
      name: player.name, position: player.position, team: player.team,
      height: player.height, weight: player.weight, jerseyNumber: player.jerseyNumber,
      bio: player.bio || "", hometown: player.hometown || "",
      birthDate: player.birthDate || "",
    });
    setIsEditing(true);
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      const token = localStorage.getItem("admin_token");
      const res = await fetch(`/api/players/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: [api.players.get.path, id] });
        setIsEditing(false);
        toast({ title: "Player updated", description: "Changes saved successfully." });
      } else {
        toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save changes.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setIsFavorited(isPlayerFavorited(id));

    const lastViewKey = `last_view_player_${id}`;
    const lastView = localStorage.getItem(lastViewKey);
    const now = Date.now();
    const cooldown = 10 * 60 * 1000; // 10 minutes

    if (!lastView || now - parseInt(lastView) > cooldown) {
      // Increment view count via API
      apiRequest("POST", `/api/players/${id}/view`).catch(console.error);
      localStorage.setItem(lastViewKey, now.toString());
    }
  }, [id]);

  const toggleFavorite = () => {
    const next = togglePlayerFavorite(id, player ? {
      name: player.name,
      headshotUrl: player.headshotUrl ?? undefined,
      team: player.team ?? undefined,
    } : undefined);
    setIsFavorited(next);
  };

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

  const rawStats = player.stats;
  const statsList = Array.isArray(rawStats) ? rawStats : [];
  const statsListIndividualOnly = statsList.filter((s) => !isCombinedStatRow(s));
  const statsObj = rawStats && !Array.isArray(rawStats) && typeof rawStats === "object" ? (rawStats as Record<string, unknown>) : null;
  const latestSeason = [...statsListIndividualOnly].sort((a, b) => b.season.localeCompare(a.season))[0];
  const currentStats = {
    ppg: String(latestSeason?.pointsPerGame ?? statsObj?.pts_per_g ?? statsObj?.pointsPerGame ?? statsObj?.ppg ?? "0.0"),
    rpg: String(latestSeason?.reboundsPerGame ?? statsObj?.trb_per_g ?? statsObj?.reboundsPerGame ?? statsObj?.rpg ?? "0.0"),
    apg: String(latestSeason?.assistsPerGame ?? statsObj?.ast_per_g ?? statsObj?.assistsPerGame ?? statsObj?.apg ?? "0.0"),
    season: String(latestSeason?.season ?? statsObj?.season ?? "N/A")
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
      <div className="relative min-h-[auto] md:min-h-[60vh] overflow-hidden border-b border-border pb-6 md:pb-12">
        <div className="absolute inset-0 bg-background/60 z-10" />
        
        {/* Background Image (blurred) */}
        <div 
          className="absolute inset-0 bg-cover bg-center opacity-10 z-0 grayscale"
          style={{ backgroundImage: `url(${player.headshotUrl?.startsWith("/objects/") ? player.headshotUrl : (player.headshotUrl || DEFAULT_HEADSHOT)})` }}
        />
        
        <div className="container mx-auto px-4 h-full relative z-20 flex flex-col justify-between py-8">
          <Button type="button" variant="outline" size="sm" className="rounded-full w-fit mb-4" onClick={() => (window.history.length > 1 ? window.history.back() : setLocation("/"))} data-testid="button-back">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <div className="flex flex-col md:flex-row items-center md:items-end gap-4 md:gap-12">
            {/* Player Image */}
            <div className="relative flex-shrink-0 z-30 mt-4 md:mt-0 md:mb-[-160px] md:-translate-y-[120px]">
              <div className="w-36 h-36 md:w-64 md:h-64 rounded-2xl overflow-hidden border-4 border-background shadow-2xl bg-muted">
                <img 
                  src={player.headshotUrl?.startsWith("/objects/") ? player.headshotUrl : (player.headshotUrl || DEFAULT_HEADSHOT)} 
                  alt={player.name} 
                  className="w-full h-full object-cover object-top"
                  onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_HEADSHOT; }}
                />
              </div>
              <div className="absolute -top-3 -right-3 md:-top-4 md:-right-4 bg-primary text-white w-12 h-12 md:w-16 md:h-16 flex items-center justify-center rounded-lg font-display text-2xl md:text-3xl font-bold border-4 border-background shadow-lg">
                #{player.jerseyNumber}
              </div>
              {isAdmin && (
                <div className="absolute -bottom-2 -left-2 md:-bottom-3 md:-left-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleHeadshotUpload}
                    data-testid="input-headshot-file"
                  />
                  <Button
                    size="icon"
                    variant="default"
                    className="rounded-full border-4 border-background shadow-lg"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingHeadshot}
                    data-testid="button-upload-headshot"
                  >
                    {isUploadingHeadshot ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                  </Button>
                </div>
              )}
            </div>

            {/* Player Info */}
            <div className="flex-1 pb-4 md:pb-8 pt-2 md:pt-0 flex flex-col justify-end items-center md:items-start">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-4 md:mb-6 w-full">
                <div className="text-center md:text-left">
                  {(() => {
                    const displayTeam = TEAM_ABBREV_TO_FULL[player.team?.toUpperCase?.()] ?? player.team ?? "";
                    return (
                      <Link href={`/roster/${encodeURIComponent(displayTeam)}/2025-26`}>
                        <Button variant="ghost" className="p-0 h-auto hover:bg-transparent">
                          <h3 className="text-primary font-mono text-sm md:text-lg uppercase tracking-widest mb-1 hover:text-primary/80 transition-colors cursor-pointer">{displayTeam}</h3>
                        </Button>
                      </Link>
                    );
                  })()}
                  <h1 className="font-display text-4xl md:text-8xl font-bold leading-[0.85] text-foreground tracking-tighter">
                    {player.name}
                  </h1>
                </div>
                <div className="flex flex-col gap-3">
                  {isAdmin && !isEditing && (
                    <Button
                      variant="outline"
                      className="w-full flex items-center justify-center gap-2 rounded-xl"
                      onClick={startEditing}
                      data-testid="button-edit-player"
                    >
                      <Pencil className="w-4 h-4" />
                      <span className="font-display font-bold uppercase tracking-tight">Edit Player</span>
                    </Button>
                  )}
                  <Button 
                    type="button"
                    variant={isFavorited ? "default" : "secondary"} 
                    className={`w-full h-12 flex items-center justify-center gap-2 border-2 ${isFavorited ? 'border-primary' : 'border-border'} rounded-xl transition-all`}
                    onClick={toggleFavorite}
                  >
                    <Flag className={`w-5 h-5 ${isFavorited ? 'fill-current' : ''}`} />
                    <span className="font-display font-bold uppercase tracking-tight">Favorite</span>
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 md:gap-6 items-center md:items-start">
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 md:gap-4 text-xs md:text-sm text-foreground/60 font-mono">
                  <Badge variant="outline" className="text-foreground border-border px-4 py-1">
                    {player.position}
                  </Badge>
                  <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                    <span className="text-primary font-bold">HT</span> {player.height ?? "—"}
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                    <span className="text-primary font-bold">WT</span> {player.weight && player.weight !== "—" ? `${player.weight} lbs` : (player.weight ?? "—")}
                  </div>
                  {player.birthDate && (
                    <>
                      <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                        <span className="text-primary font-bold">AGE</span> {calculateAge(player.birthDate)}
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-full border border-border">
                        <span className="text-primary font-bold">DOB</span> {new Date(player.birthDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
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
      <div className="container mx-auto px-4 mt-16">
        <div className="grid grid-cols-1 gap-8">
          
          <div className="flex justify-center -mb-4">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-3 text-muted-foreground bg-card w-fit px-6 py-3 rounded-2xl border border-border shadow-sm">
                <Eye className="w-6 h-6 text-primary" />
                <span className="font-display text-2xl uppercase tracking-wider font-bold"><span className="text-black dark:text-white">{displayedProfileViews ?? player?.profileViews ?? 0}</span><span className="ml-3">Profile Views</span></span>
              </div>
              {isAdmin && (
                <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-xl border border-border">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold whitespace-nowrap">Set views</label>
                  <input
                    type="number"
                    min={0}
                    value={profileViewsInput}
                    onChange={(e) => setProfileViewsInput(e.target.value)}
                    className="w-24 px-2 py-1.5 bg-muted border border-border rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                    data-testid="input-admin-profile-views"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={saveProfileViews}
                    disabled={savingProfileViews}
                    data-testid="button-save-profile-views"
                  >
                    {savingProfileViews ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {savingProfileViews ? " Saving" : " Save"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {isEditing && (
            <section className="bg-card rounded-2xl border border-border p-6 shadow-xl" data-testid="section-edit-player">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-2xl">Edit Player Info</h3>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSaving} data-testid="button-cancel-edit">
                    <X className="w-4 h-4 mr-2" /> Cancel
                  </Button>
                  <Button onClick={saveChanges} disabled={isSaving} data-testid="button-save-player">
                    {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                    Save Changes
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Name</label>
                  <input className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} data-testid="input-edit-name" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Position</label>
                  <select className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} data-testid="input-edit-position">
                    <option value="PG">PG</option>
                    <option value="SG">SG</option>
                    <option value="SF">SF</option>
                    <option value="PF">PF</option>
                    <option value="C">C</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Team</label>
                  <input className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.team} onChange={(e) => setEditForm({ ...editForm, team: e.target.value })} data-testid="input-edit-team" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Height</label>
                  <input className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="6'6&quot;" value={editForm.height} onChange={(e) => setEditForm({ ...editForm, height: e.target.value })} data-testid="input-edit-height" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Weight</label>
                  <input className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="220 lbs" value={editForm.weight} onChange={(e) => setEditForm({ ...editForm, weight: e.target.value })} data-testid="input-edit-weight" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Jersey #</label>
                  <input type="number" className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.jerseyNumber} onChange={(e) => setEditForm({ ...editForm, jerseyNumber: parseInt(e.target.value) || 0 })} data-testid="input-edit-jersey" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Date of Birth</label>
                  <input type="date" className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" value={editForm.birthDate} onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })} data-testid="input-edit-dob" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Hometown</label>
                  <input className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary" placeholder="City, State" value={editForm.hometown} onChange={(e) => setEditForm({ ...editForm, hometown: e.target.value })} data-testid="input-edit-hometown" />
                </div>
                <div className="flex flex-col gap-1.5 md:col-span-2 lg:col-span-3">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground font-bold">Bio</label>
                  <textarea rows={3} className="px-3 py-2 bg-muted border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" value={editForm.bio} onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })} data-testid="input-edit-bio" />
                </div>
              </div>
            </section>
          )}

          {/* Top Row: Quick Stats & Charts */}
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

            <div className="lg:col-span-2">
              <div className="grid grid-cols-2 gap-2 md:gap-6">
                <StatsChart stats={statsListIndividualOnly} dataKey="pointsPerGame" label="Points" color="hsl(var(--primary))" />
                {player.position === "C" || player.position === "PF" ? (
                  <StatsChart stats={statsListIndividualOnly} dataKey="reboundsPerGame" label="Rebounds" color="hsl(var(--accent))" />
                ) : (
                  <StatsChart stats={statsListIndividualOnly} dataKey="assistsPerGame" label="Assists" color="hsl(var(--accent))" />
                )}
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
                  {(() => {
                    const sorted = [...statsListIndividualOnly].sort((a, b) => {
                      const seasonCmp = b.season.localeCompare(a.season);
                      if (seasonCmp !== 0) return seasonCmp;
                      return b.id - a.id;
                    });
                    const seasonLeagueCounts: Record<string, number> = {};
                    sorted.forEach((s) => {
                      const key = `${s.season}-${s.league || "NBA"}`;
                      seasonLeagueCounts[key] = (seasonLeagueCounts[key] || 0) + 1;
                    });
                    const seasonLeagueIndex: Record<string, number> = {};
                    return sorted.map((stat) => {
                      const slKey = `${stat.season}-${stat.league || "NBA"}`;
                      const isMultiTeamSeason = seasonLeagueCounts[slKey] > 1;
                      if (!seasonLeagueIndex[slKey]) seasonLeagueIndex[slKey] = 0;
                      seasonLeagueIndex[slKey]++;
                      const isFirstRowInSeason = seasonLeagueIndex[slKey] === 1;
                      return (
                        <tr key={stat.id} className={`hover:bg-muted/50 transition-colors ${isMultiTeamSeason ? 'bg-muted/20' : ''}`}>
                          <td className="px-6 py-4 font-mono font-medium">
                            {isFirstRowInSeason ? formatSeasonDisplay(stat.season) : ''}
                          </td>
                          <td className="px-6 py-4 font-mono text-muted-foreground whitespace-nowrap">{stat.league || "NBA"}</td>
                          <td className="px-6 py-4 font-mono">
                            <Link href={`/roster/${encodeURIComponent(TEAM_ABBREV_TO_FULL[stat.team] ?? stat.team)}/${encodeURIComponent(formatSeasonDisplay(stat.season))}`}>
                              <Button variant="ghost" className="p-0 h-auto text-primary whitespace-nowrap" data-testid={`link-team-${stat.id}`}>
                                {TEAM_ABBREV_TO_FULL[stat.team] ?? stat.team}
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
                      );
                    });
                  })()}
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

        <div className="flex justify-center py-8">
          {!isAdmin && !showAdminLogin && (
            <Button
              size="icon"
              variant="outline"
              className="rounded-full opacity-30 hover:opacity-100 transition-opacity"
              onClick={() => setShowAdminLogin(true)}
              data-testid="button-admin-login-toggle"
            >
              <Lock className="w-4 h-4" />
            </Button>
          )}

          {showAdminLogin && (
            <div className="bg-card border border-border rounded-xl p-4 shadow-2xl w-72">
              <div className="flex items-center justify-between mb-3">
                <span className="font-display text-sm uppercase tracking-wider">Admin Login</span>
                <Button size="icon" variant="ghost" onClick={() => { setShowAdminLogin(false); setAdminError(""); }} data-testid="button-admin-close">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                placeholder="Password"
                className="w-full px-3 py-2 bg-muted border border-border rounded-md text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
                data-testid="input-admin-password"
              />
              {adminError && <p className="text-destructive text-xs mb-2">{adminError}</p>}
              <Button className="w-full" onClick={handleAdminLogin} data-testid="button-admin-submit">
                Login
              </Button>
            </div>
          )}

          {isAdmin && (
            <Badge variant="outline" className="bg-card border-primary/30 text-primary px-3 py-1">
              <Lock className="w-3 h-3 mr-1" /> Admin
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
