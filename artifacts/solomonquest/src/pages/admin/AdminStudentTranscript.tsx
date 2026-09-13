import { useParams, Link } from "wouter";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { TranscriptDocument } from "@/pages/student/StudentTranscript";
import { ArrowLeft } from "lucide-react";

export default function AdminStudentTranscript() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;

  return (
    <AdminLayout>
      <div className="px-6 pt-4 pb-0 print:hidden">
        <Link href="/dashboard/admin/users">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Users
          </button>
        </Link>
      </div>
      <div className="px-6 pb-6">
        <TranscriptDocument studentId={studentId} bare />
      </div>
    </AdminLayout>
  );
}
