import { useEffect } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Copy, Download, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { apiJson } from "@/lib/apiClient";
import { CertificateCanvas, CertificateView, formatCertDate, verifyUrlFor } from "@/components/certificates/CertificateView";
import { awardName, certificateToData, type Certificate } from "@/components/certificates/certApi";

// Print stylesheet: one A4-landscape page, no margins, only the certificate.
// "Download PDF" opens the browser's print dialog, where "Save as PDF" gives
// a vector PDF (text stays selectable and crisp at any zoom).
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
  body * { visibility: hidden !important; }
  .cert-print-root, .cert-print-root * { visibility: visible !important; }
  .cert-print-root { display: block !important; position: fixed; left: 0; top: 0; width: 297mm; height: 209.5mm; overflow: hidden; }
}
`;

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { data: cert, isLoading, error } = useQuery({
    queryKey: ["certificate", id],
    queryFn: () => apiJson<Certificate>(`/api/certificates/${id}`),
    enabled: !!id,
  });

  useEffect(() => {
    if (!cert) return;
    const prev = document.title;
    // Becomes the default file name in "Save as PDF".
    document.title = `${cert.title} - ${cert.studentName} - ${awardName(cert)}`.replace(/[\\/:*?"<>|]/g, "");
    return () => { document.title = prev; };
  }, [cert]);

  const back =
    user?.role === "admin" || user?.role === "super_admin"
      ? "/dashboard/admin/certificates"
      : user?.role === "parent"
      ? "/dashboard/parent"
      : "/dashboard/student/certificates";

  const copyLink = () => {
    if (!cert) return;
    navigator.clipboard?.writeText(verifyUrlFor(cert.verificationCode)).then(
      () => toast.success("Verification link copied"),
      () => toast.error("Couldn't copy the link"),
    );
  };

  return (
    <div className="min-h-screen bg-muted/40">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto max-w-6xl px-4 py-4 sm:py-6 print:hidden">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={back}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyLink} disabled={!cert}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy verification link
            </Button>
            <Button size="sm" onClick={() => window.print()} disabled={!cert} data-testid="download-pdf">
              <Download className="mr-1.5 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="aspect-[297/210] w-full rounded-md" />
        ) : error || !cert ? (
          <div className="rounded-xl border bg-card p-10 text-center">
            <p className="font-semibold">Certificate not found</p>
            <p className="mt-1 text-sm text-muted-foreground">{(error as Error)?.message ?? "It may have been removed."}</p>
          </div>
        ) : (
          <>
            <CertificateView data={certificateToData(cert)} />
            <div className="mt-4 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-1.5">
                {cert.status === "valid" ? (
                  <><ShieldCheck className="h-4 w-4 text-success" /> Valid · issued {formatCertDate(cert.issuedAt)}</>
                ) : (
                  <><ShieldOff className="h-4 w-4 text-destructive" /> Revoked{cert.revokedAt ? ` on ${formatCertDate(cert.revokedAt)}` : ""}</>
                )}
              </span>
              <span>
                Tip: in the print dialog choose <strong>Save as PDF</strong>, landscape, no margins.
              </span>
            </div>
          </>
        )}
      </div>
      {cert && (
        <div className="cert-print-root hidden" aria-hidden="true">
          <CertificateCanvas data={certificateToData(cert)} />
        </div>
      )}
    </div>
  );
}
