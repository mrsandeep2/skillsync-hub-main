import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import "@/styles/seeker-dashboard.css";
import Navbar from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, ShoppingBag, Clock, Star, IndianRupee, User, Mail, Save, X, Home } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const statusColors: Record<string, string> = {
  pending: "bg-warning/20 text-warning",
  confirmed: "bg-info/20 text-info",
  in_progress: "bg-info/20 text-info",
  completed: "bg-success/20 text-success",
  cancelled: "bg-destructive/20 text-destructive",
};

const SeekerDashboard = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editAvatar, setEditAvatar] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["seeker-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) {
      setEditName(profile.name);
      setEditLocation((profile as any).location ?? "");
      setEditAvatar(profile.avatar_url ?? "");
    }
  }, [profile]);

  const { data: bookings = [] } = useQuery({
    queryKey: ["my-bookings", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("bookings")
        .select("*, services(title), profiles:provider_id(name, is_available)")
        .eq("seeker_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("bookings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `seeker_id=eq.${user.id}` }, () => {
        queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  // Realtime: reflect profile/availability changes (name, location, provider online)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("profiles-seeker-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, (payload) => {
        const changedId = (payload.new as any)?.id;
        if (!changedId) return;
        if (changedId === user.id) {
          queryClient.invalidateQueries({ queryKey: ["seeker-profile", user.id] });
        }
        queryClient.invalidateQueries({ queryKey: ["my-bookings", user.id] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ name: editName, location: editLocation, avatar_url: editAvatar } as any)
      .eq("id", user.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Profile updated" });
      setShowEditProfile(false);
      queryClient.invalidateQueries({ queryKey: ["seeker-profile"] });
    }
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="text-muted-foreground">Loading...</span></div>;

  const active = bookings.filter((b: any) => ["pending", "confirmed", "in_progress"].includes(b.status)).length;
  const completed = bookings.filter((b: any) => b.status === "completed").length;
  const totalSpent = bookings.filter((b: any) => b.status === "completed").reduce((s: number, b: any) => s + Number(b.amount), 0);

  return (
    <div className="min-h-screen bg-background seeker-dashboard-root">
      <Navbar />
      <div className="container px-4 pt-24 pb-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold font-display text-foreground">Welcome back{profile?.name ? `, ${profile.name}` : ""}</h1>
              <p className="text-muted-foreground mt-1">What service do you need today?</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => navigate("/")}>
                <Home className="w-4 h-4 mr-1" /> Back to Home
              </Button>
              <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setShowEditProfile(true)}>
                <User className="w-4 h-4 mr-1" /> Edit Profile
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Active Orders", value: String(active), icon: ShoppingBag },
              { label: "Completed", value: String(completed), icon: Clock },
              { label: "Total Orders", value: String(bookings.length), icon: Star },
              { label: "Total Spent", value: `₹${totalSpent.toLocaleString("en-IN")}`, icon: IndianRupee },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="glass glass-hover rounded-2xl p-5">
                  <Icon className="w-5 h-5 text-accent mb-3" />
                  <div className="text-2xl font-bold font-display text-foreground">{stat.value}</div>
                  <div className="text-sm text-muted-foreground">{stat.label}</div>
                </div>
              );
            })}
          </div>

          <div className="glass rounded-2xl p-2 mb-8 flex items-center gap-2">
            <div className="flex-1 flex items-center gap-3 px-4">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input type="text" placeholder="Search for a service..." className="w-full bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground py-3" />
            </div>
            <Button variant="hero" size="lg" className="rounded-xl" onClick={() => navigate("/services")}>Browse</Button>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold text-foreground">Recent Orders</h2>
            </div>
            {bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No orders yet. Browse services to get started!</p>
            ) : (
              <div className="space-y-4">
                {bookings.map((order: any) => (
                  <div key={order.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium text-foreground flex items-center gap-2">
                        {(order.services as any)?.title || "Service"}
                        {(order.profiles as any)?.is_available && (
                          <span className="w-2 h-2 rounded-full bg-success animate-pulse" title="Provider Online" />
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">{(order.profiles as any)?.name || "Provider"} · {new Date(order.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs px-3 py-1 rounded-full font-medium capitalize ${statusColors[order.status] || ""}`}>
                        {order.status.replace("_", " ")}
                      </span>
                      <span className="font-display font-semibold text-foreground">₹{order.amount}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Edit Profile Modal */}
          {showEditProfile && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowEditProfile(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl p-8 w-full max-w-lg relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowEditProfile(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                <h2 className="text-2xl font-bold font-display text-foreground mb-6">Edit Profile</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-foreground">Name</Label>
                    <div className="relative mt-1">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="pl-10 bg-secondary/50 border-border" />
                    </div>
                  </div>
                  <div>
                    <Label className="text-foreground">Email</Label>
                    <div className="relative mt-1">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input value={profile?.email ?? ""} disabled className="pl-10 bg-secondary/30 border-border text-muted-foreground" />
                    </div>
                  </div>
                <div>
                  <Label className="text-foreground">Location</Label>
                  <Input
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="bg-secondary/50 border-border mt-1"
                    placeholder="City / Area"
                  />
                </div>
                <div>
                  <Label className="text-foreground">Photo URL</Label>
                  <Input
                    value={editAvatar}
                    onChange={(e) => setEditAvatar(e.target.value)}
                    className="bg-secondary/50 border-border mt-1"
                    placeholder="https://..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Paste an image URL for your profile photo (storage upload can be added later).
                  </p>
                </div>
                </div>
                <Button variant="hero" className="w-full rounded-xl h-11 mt-6" onClick={saveProfile}>
                  <Save className="w-4 h-4 mr-1" /> Save Changes
                </Button>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default SeekerDashboard;
