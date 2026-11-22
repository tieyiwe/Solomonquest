import { useState } from "react";
import { useLocation } from "wouter";
import { useListSchools } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, GraduationCap, ArrowRight } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { joinSchool } from "@/lib/joinSchool";

export default function OnboardingJoin() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const { data: schools, isLoading } = useListSchools();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const filtered = (schools ?? []).filter((s) =>
    s.name?.toLowerCase().includes(query.toLowerCase()) ||
    s.slug?.toLowerCase().includes(query.toLowerCase())
  );

  async function handleSelect(schoolId: string, schoolName: string) {
    // Already signed in without a school (e.g. sent here from
    // /onboarding/setup): join directly instead of re-registering.
    if (user && !user.schoolId) {
      setJoiningId(schoolId);
      const err = await joinSchool(schoolId).catch(() => "Could not join the school");
      if (err) {
        toast.error(err);
        setJoiningId(null);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetMeQueryKey() });
      toast.success(`Welcome to ${schoolName}!`);
      setLocation("/dashboard/student");
      return;
    }
    setLocation(`/auth/register?schoolId=${encodeURIComponent(schoolId)}&schoolName=${encodeURIComponent(schoolName)}`);
  }

  return (
    <PublicLayout>
      <div className="container mx-auto px-4 py-16 max-w-2xl">
        <div className="text-center space-y-3 mb-10">
          <h1 className="text-3xl font-bold tracking-tight">Join a School</h1>
          <p className="text-muted-foreground text-lg">
            Find your school below, then create your student account.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search schools by name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        {/* School list */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            {query ? `No schools found matching "${query}"` : "No schools available yet."}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((school) => (
              <button
                key={school.id}
                onClick={() => handleSelect(school.id, school.name ?? "")}
                disabled={joiningId !== null}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-border bg-card hover:border-primary hover:bg-primary/5 transition-all text-left group"
              >
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <GraduationCap className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{school.name}</p>
                  {school.slug && (
                    <p className="text-sm text-muted-foreground truncate">{school.slug}</p>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
