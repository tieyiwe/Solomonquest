import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useListApplications, useUpdateApplicationStatus, getListApplicationsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";

export default function AdminAdmissions() {
  const queryClient = useQueryClient();
  const { data: applications, isLoading } = useListApplications();
  const updateStatus = useUpdateApplicationStatus();

  const handleStatusChange = (id: string, status: string) => {
    updateStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast.success("Application status updated");
          queryClient.invalidateQueries({ queryKey: getListApplicationsQueryKey() });
        },
        onError: (err: any) => {
          toast.error(err.message || "Failed to update application");
        }
      }
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Admissions</h1>
          <p className="text-muted-foreground">Review and manage student applications.</p>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Applicant Name</TableHead>
                  <TableHead>Program</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[200px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-9 w-[150px]" /></TableCell>
                    </TableRow>
                  ))
                ) : applications && applications.length > 0 ? (
                  applications.map((app) => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.applicantName || "Unknown"}</TableCell>
                      <TableCell className="text-muted-foreground">{app.programName || "General Admission"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            app.status === "approved" ? "default" : 
                            app.status === "rejected" ? "destructive" : 
                            "secondary"
                          }
                          className="capitalize"
                        >
                          {app.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select 
                          defaultValue={app.status} 
                          onValueChange={(val) => handleStatusChange(app.id, val)}
                          disabled={updateStatus.isPending}
                        >
                          <SelectTrigger className="h-8 w-[150px]">
                            <SelectValue placeholder="Update status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No applications to review.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
