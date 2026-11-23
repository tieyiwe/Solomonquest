import { Link } from "wouter";
import { Award, Download } from "lucide-react";
import { StudentLayout } from "@/components/layout/StudentLayout";
import PageHeader from "@/components/layout/PageHeader";
import { EmptyState, LoadingRows } from "@/components/common/States";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CertificateView, formatCertDate } from "@/components/certificates/CertificateView";
import { awardName, certificateToData } from "@/components/certificates/certApi";
import { useMyCertificates } from "@/components/certificates/MyCertificatesCard";

export default function StudentCertificates() {
  const { data, isLoading, error } = useMyCertificates();
  return (
    <StudentLayout>
      <PageHeader icon={Award} title="My certificates" description="Certificates your school has awarded you. Download them as PDF or share the verification link." />
      {isLoading ? (
        <LoadingRows rows={3} />
      ) : error ? (
        <EmptyState icon={Award} title="Couldn't load your certificates" description={(error as Error).message} />
      ) : !data || data.length === 0 ? (
        <EmptyState icon={Award} title="No certificates yet" description="When you complete a course, your certificate will appear here." />
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {data.map((c) => (
            <div key={c.id} className="space-y-3">
              <Link href={`/certificates/${c.id}`} aria-label={`Open ${c.title} for ${awardName(c)}`} className="block">
                <CertificateView data={certificateToData(c)} className="transition-transform hover:-translate-y-0.5" />
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{awardName(c)}</div>
                  <div className="text-xs text-muted-foreground">Issued {formatCertDate(c.issuedAt)}</div>
                </div>
                {c.status === "revoked" && <Badge variant="destructive">Revoked</Badge>}
                <Button asChild size="sm">
                  <Link href={`/certificates/${c.id}`}><Download className="mr-1.5 h-4 w-4" /> View &amp; download</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </StudentLayout>
  );
}
