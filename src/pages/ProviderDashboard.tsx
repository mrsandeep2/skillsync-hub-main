import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import Navbar from "@/components/layout/Navbar";
import "@/styles/provider-dashboard.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IndianRupee, CheckCircle, Clock, Plus, X, Package, ToggleLeft, ToggleRight,
  User, Mail, Save, Home
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { serviceCategories } from "@/data/marketplace";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ProviderDashboard = () => {
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showAddService, setShowAddService] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showDelayModal, setShowDelayModal] = useState(false);
  const [delayBookingId, setDelayBookingId] = useState<string | null>(null);
  const [delayDate, setDelayDate] = useState<string>("");
  const [delayTime, setDelayTime] = useState<string>("");
  const [delayMessage, setDelayMessage] = useState<string>("");
  const [newService, setNewService] = useState({
    title: "",
    description: "",
    category: "",
    price: "",
    location: "",
  });
  const [editName, setEditName] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  // Realtime: listen for service approval changes and booking updates
  useEffect(() => {
    if (!user) return;
    
    const ch1 = supabase.channel(`provider-services-rt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "services", filter: `provider_id=eq.${user.id}` }, (payload) => {
        console.log("📲 Service updated:", payload);
        queryClient.invalidateQueries({ queryKey: ["provider-services", user.id] });
      })
      .subscribe((status) => console.log("Services channel:", status));
    
    const ch2 = supabase.channel(`provider-bookings-rt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `provider_id=eq.${user.id}` }, (payload) => {
        console.log("📲 Booking for provider updated:", payload);
        queryClient.invalidateQueries({ queryKey: ["provider-bookings", user.id] });
      })
      .subscribe((status) => console.log("Bookings channel:", status));
    
    const ch3 = supabase.channel(`provider-reviews-rt-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reviews", filter: `provider_id=eq.${user.id}` }, (payload) => {
        console.log("📲 Review updated:", payload);
        queryClient.invalidateQueries({
          predicate: (q) =>
            Array.isArray(q.queryKey) &&
            (q.queryKey[0] === "provider-services" || q.queryKey[0] === "provider-bookings" || q.queryKey[0] === "services"),
        });
      })
      .subscribe((status) => console.log("Reviews channel:", status));
    
    return () => {
      supabase.removeChannel(ch1);
      supabase.removeChannel(ch2);
      supabase.removeChannel(ch3);
    };
  }, [user?.id, queryClient]);

  const { data: profile } = useQuery({
    queryKey: ["provider-profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).single();
      return data;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (profile) setEditName(profile.name);
  }, [profile]);

  const { data: services = [] } = useQuery({
    queryKey: ["provider-services", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("services").select("*").eq("provider_id", user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: bookings = [] } = useQuery({
    queryKey: ["provider-bookings", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("*, services:service_id (title)")
        .eq("provider_id", user!.id)
        .order("created_at", { ascending: false });
      // Fetch seeker names separately
      const enriched = await Promise.all((data ?? []).map(async (b: any) => {
        const { data: seekerData } = await supabase.from("profiles").select("name").eq("id", b.seeker_id).single();
        return { ...b, seeker_name: seekerData?.name || "Customer" };
      }));
      return enriched;
    },
    enabled: !!user,
  });

  const completedCount = bookings.filter((b: any) => b.status === "completed").length;
  const totalEarnings = bookings.filter((b: any) => b.status === "completed").reduce((sum: number, b: any) => sum + Number(b.amount), 0);
  const pendingCount = bookings.filter((b: any) => b.status === "pending").length;

  const toggleAvailability = async () => {
    if (!user) return;
    const newVal = !(profile as any)?.is_available;
    await supabase.from("profiles").update({ is_available: newVal } as any).eq("id", user.id);
    queryClient.invalidateQueries({ queryKey: ["provider-profile"] });
  };

  const updateBooking = async (id: string, status: string) => {
    // Optimistic update: update cache immediately for snappy UI
    const providerKey = ["provider-bookings", user?.id];
    const previousProvider = queryClient.getQueryData<any[]>(providerKey);
    try {
      // locally update provider-bookings cache
      queryClient.setQueryData(providerKey, (old: any[] | undefined) =>
        (old || []).map((r) => (r.id === id ? { ...r, status } : r))
      );

      // also update any my-bookings queries for seekers (best-effort)
      const myBookingsQueries = queryClient.getQueryCache().findAll({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "my-bookings" });
      myBookingsQueries.forEach((q) => {
        queryClient.setQueryData(q.queryKey as any, (old: any[] | undefined) =>
          (old || []).map((r) => (r.id === id ? { ...r, status } : r))
        );
      });

      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;

      console.log(`✅ Booking ${id} updated to ${status}`);

      // Invalidate to ensure server canonical state
      await queryClient.invalidateQueries({ queryKey: ["provider-bookings", user?.id] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "my-bookings" });

      toast({ title: `Booking ${status}`, description: "Updated successfully" });
    } catch (err: any) {
      // rollback
      if (previousProvider) queryClient.setQueryData(providerKey, previousProvider);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // Extended update: allow additional fields (notes, scheduled_date, scheduled_time)
  const updateBookingExtended = async (id: string, payload: Record<string, any>) => {
    // Optimistic update for status and scheduling fields
    const providerKey = ["provider-bookings", user?.id];
    const previousProvider = queryClient.getQueryData<any[]>(providerKey);
    try {
      queryClient.setQueryData(providerKey, (old: any[] | undefined) =>
        (old || []).map((r) => (r.id === id ? { ...r, ...payload } : r))
      );

      const myBookingsQueries = queryClient.getQueryCache().findAll({ predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "my-bookings" });
      myBookingsQueries.forEach((q) => {
        queryClient.setQueryData(q.queryKey as any, (old: any[] | undefined) =>
          (old || []).map((r) => (r.id === id ? { ...r, ...payload } : r))
        );
      });

      const { error } = await supabase.from("bookings").update(payload).eq("id", id);
      if (error) throw error;

      console.log(`✅ Booking ${id} updated`, payload);

      await queryClient.invalidateQueries({ queryKey: ["provider-bookings", user?.id] });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "my-bookings" });
      queryClient.invalidateQueries({ predicate: (query) => Array.isArray(query.queryKey) && query.queryKey[0] === "admin-orders" });

      toast({ title: "Booking updated", description: "Status updated successfully" });
    } catch (err: any) {
      if (previousProvider) queryClient.setQueryData(providerKey, previousProvider);
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const addServiceMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("services").insert({
        provider_id: user!.id,
        title: newService.title,
        description: newService.description,
        category: newService.category,
        price: Number(newService.price),
        location: newService.location,
        approval_status: "pending",
        is_active: false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Service submitted", description: "Sent to admin for approval." });
      setShowAddService(false);
      setNewService({ title: "", description: "", category: "", price: "", location: "" });
      queryClient.invalidateQueries({ queryKey: ["provider-services"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleService = async (id: string, currentActive: boolean) => {
    await supabase.from("services").update({ is_active: !currentActive }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["provider-services"] });
  };

  const saveProfile = async () => {
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ name: editName }).eq("id", user.id);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else {
      toast({ title: "Profile updated" });
      setShowEditProfile(false);
      queryClient.invalidateQueries({ queryKey: ["provider-profile"] });
    }
  };

  const isAvailable = (profile as any)?.is_available ?? true;

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><span className="text-muted-foreground">Loading...</span></div>;

  return (
    <div className="min-h-screen bg-background provider-dashboard-root">
      <Navbar />
      <div className="container px-4 pt-24 pb-12">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold font-display text-foreground">Provider Hub</h1>
              <p className="text-muted-foreground mt-1">Manage your services and earnings</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => navigate("/")}>
                <Home className="w-4 h-4 mr-1" /> Back to Home
              </Button>
              <Button variant="ghost" size="sm" className="rounded-lg" onClick={() => setShowEditProfile(true)}>
                <User className="w-4 h-4 mr-1" /> Edit Profile
              </Button>
              <button onClick={toggleAvailability} className="glass rounded-xl px-4 py-2 flex items-center gap-2 cursor-pointer hover:border-accent/30 transition-all">
                {isAvailable ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-sm text-foreground font-medium">Online</span>
                    <ToggleRight className="w-5 h-5 text-success" />
                  </>
                ) : (
                  <>
                    <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                    <span className="text-sm text-muted-foreground font-medium">Offline</span>
                    <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: "Total Earnings", value: `₹${totalEarnings.toLocaleString("en-IN")}`, icon: IndianRupee },
              { label: "Completed Jobs", value: String(completedCount), icon: CheckCircle },
              { label: "Active Services", value: String(services.filter((s: any) => s.is_active && s.approval_status === "approved").length), icon: Package },
              { label: "Pending Bookings", value: String(pendingCount), icon: Clock },
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

          {/* Incoming bookings */}
          <div className="glass rounded-2xl p-6 mb-8">
            <h2 className="text-xl font-display font-semibold text-foreground mb-6">Incoming Jobs</h2>
            {bookings.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No bookings yet</p>
            ) : (
              <div className="space-y-4">
                {bookings.slice(0, 10).map((b: any) => (
                  <div key={b.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{(b.services as any)?.title || "Service"}</div>
                      <div className="text-sm text-muted-foreground">
                        {b.seeker_name || "Customer"} · {b.scheduled_date || "No date"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-display font-semibold text-foreground">₹{b.amount}</span>
                      {b.status === "pending" ? (
                        <div className="flex gap-2">
                          <Button variant="hero" size="sm" className="rounded-lg" onClick={() => updateBooking(b.id, "confirmed")}>Accept</Button>
                          <Button variant="ghost" size="sm" className="rounded-lg text-destructive" onClick={() => updateBooking(b.id, "cancelled")}>Decline</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                            b.status === "completed" ? "bg-success/20 text-success" :
                            b.status === "confirmed" ? "bg-info/20 text-info" :
                            b.status === "cancelled" ? "bg-destructive/20 text-destructive" :
                            "bg-warning/20 text-warning"
                          }`}>{b.status}</span>
                          {/* Provider actions for ongoing booking */}
                          {b.status !== "completed" && b.status !== "cancelled" && (
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => updateBooking(b.id, "in_progress")}>Mark Working</Button>
                              <Button size="sm" variant="ghost" onClick={() => { setDelayBookingId(b.id); setShowDelayModal(true); }}>Delay</Button>
                              <Button size="sm" variant="hero" onClick={() => updateBooking(b.id, "completed")}>Mark Completed</Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* My Services */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold text-foreground">My Services</h2>
              <Button variant="hero" size="sm" className="rounded-lg" onClick={() => setShowAddService(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Service
              </Button>
            </div>
            {services.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No services yet. Add your first service!</p>
            ) : (
              <div className="space-y-3">
                {services.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between p-4 rounded-xl bg-secondary/30">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{s.title}</div>
                      <div className="text-sm text-muted-foreground">{s.category} · ₹{s.price}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        s.approval_status === "approved" ? "bg-success/20 text-success" :
                        s.approval_status === "pending" ? "bg-warning/20 text-warning" :
                        "bg-destructive/20 text-destructive"
                      }`}>{s.approval_status}</span>
                      {s.approval_status === "approved" && (
                        <button onClick={() => toggleService(s.id, s.is_active)} className="text-xs text-muted-foreground hover:text-foreground">
                          {s.is_active ? <ToggleRight className="w-5 h-5 text-success" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Add Service Modal */}
          {showAddService && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowAddService(false)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl p-8 w-full max-w-lg relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowAddService(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                <h2 className="text-2xl font-bold font-display text-foreground mb-6">Add New Service</h2>
                <div className="space-y-4">
                  <div>
                    <Label className="text-foreground">Title</Label>
                    <Input value={newService.title} onChange={(e) => setNewService({ ...newService, title: e.target.value })} className="bg-secondary/50 border-border mt-1" placeholder="e.g. Web Development" />
                  </div>
                  <div>
                    <Label className="text-foreground">Description</Label>
                    <Input value={newService.description} onChange={(e) => setNewService({ ...newService, description: e.target.value })} className="bg-secondary/50 border-border mt-1" placeholder="Describe your service..." />
                  </div>
                  <div>
                    <Label className="text-foreground">Category</Label>
                    <Select value={newService.category} onValueChange={(v) => setNewService({ ...newService, category: v })}>
                      <SelectTrigger className="bg-secondary/50 border-border mt-1"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {serviceCategories.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-foreground">Location</Label>
                    <Input
                      value={newService.location}
                      onChange={(e) =>
                        setNewService({ ...newService, location: e.target.value })
                      }
                      className="bg-secondary/50 border-border mt-1"
                      placeholder="City / Area (e.g. Bangalore, Indiranagar)"
                    />
                  </div>
                  <div>
                    <Label className="text-foreground">Price (₹)</Label>
                    <Input type="number" value={newService.price} onChange={(e) => setNewService({ ...newService, price: e.target.value })} className="bg-secondary/50 border-border mt-1" placeholder="500" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-4">Your service will be reviewed by an admin before going live.</p>
                <Button
                  variant="hero"
                  className="w-full rounded-xl h-11 mt-6"
                  disabled={!newService.title || !newService.category || !newService.price || addServiceMutation.isPending}
                  onClick={() => addServiceMutation.mutate()}
                >
                  {addServiceMutation.isPending ? "Submitting..." : "Submit for Approval"}
                </Button>
              </motion.div>
            </div>
          )}

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
                </div>
                <Button variant="hero" className="w-full rounded-xl h-11 mt-6" onClick={saveProfile}>
                  <Save className="w-4 h-4 mr-1" /> Save Changes
                </Button>
              </motion.div>
            </div>
          )}

          {/* Delay Modal */}
          {showDelayModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4" onClick={() => setShowDelayModal(false)}>
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass rounded-2xl p-6 w-full max-w-md relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setShowDelayModal(false)} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
                <h3 className="text-xl font-semibold mb-4">Set Delay / Reschedule</h3>
                <div className="space-y-3">
                  <div>
                    <Label>Next Date</Label>
                    <Input type="date" value={delayDate} onChange={(e) => setDelayDate(e.target.value)} className="bg-secondary/50" />
                  </div>
                  <div>
                    <Label>Next Time</Label>
                    <Input type="time" value={delayTime} onChange={(e) => setDelayTime(e.target.value)} className="bg-secondary/50" />
                  </div>
                  <div>
                    <Label>Message / Reason</Label>
                    <Input value={delayMessage} onChange={(e) => setDelayMessage(e.target.value)} className="bg-secondary/50" placeholder="e.g. Running late, will reach by 2 days" />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <Button variant="hero" onClick={async () => {
                    if (!delayBookingId) return;
                    const payload: any = { status: "in_progress" };
                    if (delayDate) payload.scheduled_date = delayDate;
                    if (delayTime) payload.scheduled_time = delayTime;
                    if (delayMessage) payload.notes = (delayMessage || "") + ("\n(Rescheduled by provider)");
                    await updateBookingExtended(delayBookingId, payload);
                    setShowDelayModal(false);
                    setDelayBookingId(null);
                    setDelayDate("");
                    setDelayTime("");
                    setDelayMessage("");
                  }}>Save</Button>
                  <Button variant="ghost" onClick={() => { setShowDelayModal(false); setDelayBookingId(null); }}>Cancel</Button>
                </div>
              </motion.div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default ProviderDashboard;
