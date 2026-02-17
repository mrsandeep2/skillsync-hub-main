import { useEffect } from "react";
import { motion } from "framer-motion";
import { Users, Briefcase, CheckCircle, Star, Grid3X3, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const Stats = () => {
  const queryClient = useQueryClient();
  
  // Realtime: refresh stats when services change
  useEffect(() => {
    const ch = supabase.channel("home-stats-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "services" }, () => {
        queryClient.invalidateQueries({ queryKey: ["platform-stats"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const { data: stats } = useQuery({
    queryKey: ["platform-stats"],
    queryFn: async () => {
      const [providers, services, bookings, reviews] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("services").select("id", { count: "exact", head: true }).eq("is_active", true).eq("approval_status", "approved"),
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "completed"),
        supabase.from("reviews").select("rating"),
      ]);
      const ratings = reviews.data ?? [];
      const avg = ratings.length > 0 ? (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length).toFixed(1) : "0";
      return {
        providers: providers.count ?? 0,
        services: services.count ?? 0,
        completed: bookings.count ?? 0,
        avgRating: avg,
      };
    },
  });

  const items = [
    { label: "Verified Providers", value: String(stats?.providers ?? 0), icon: Users },
    { label: "Available Services", value: String(stats?.services ?? 0), icon: Briefcase },
    { label: "Completed Orders", value: String(stats?.completed ?? 0), icon: CheckCircle },
    { label: "Average Rating", value: stats?.avgRating ?? "0", icon: Star },
  ];

  return (
    <section className="py-20 relative">
      <div className="absolute inset-0 gradient-primary opacity-5" />
      <div className="container px-4 relative">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((stat, i) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <Icon className="w-6 h-6 text-accent mx-auto mb-3" />
                <div className="text-2xl md:text-3xl font-bold font-display text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default Stats;
