import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiJson } from "@/lib/apiClient";
import { awardName, type Certificate } from "./certApi";

export function useMyCertificates() {
  return useQuery({
    queryKey: ["my-certificates"],
    queryFn: () => apiJson<Certificate[]>("/api/certificates/mine"),
    staleTime: 60_000,
    retry: false,
  });
}

/** Student dashboard card: renders nothing until the student has a certificate. */
export function MyCertificatesCard() {
  const { data } = useMyCertificates();
  const valid = (data ?? []).filter((c) => c.status === "valid");
  if (valid.length === 0) return null;
  return (
    <div className="rounded-xl border border-gold/40 bg-gradient-to-br from-gold/10 to-transparent p-4" data-testid="my-certificates-card">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/20">
          <Award className="h-5 w-5 text-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold">
            {valid.length === 1 ? "You've earned a certificate" : `You've earned ${valid.length} certificates`}
          </div>
          <div className="truncate text-sm text-muted-foreground">{valid.map(awardName).join(" · ")}</div>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/student/certificates">View</Link>
        </Button>
      </div>
    </div>
  );
}
