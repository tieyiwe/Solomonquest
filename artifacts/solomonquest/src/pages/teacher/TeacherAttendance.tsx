import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { TeacherLayout } from "@/components/layout/TeacherLayout";
import { useGetMyCourses } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StudentAttendance {
  id: string;
  name: string | null;
  unique_student_id: string | null;
  checked_in: boolean;
  checked_in_at: string | null;
  attendance_id: string | null;
}

interface AttendanceResponse {
  total_enrolled: number;
  total_checked_in: number;
  students: StudentAttendance[];
}

function formatTime(isoString: string | null): string {
  if (!isoString) return "—";
  return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("token") ?? sessionStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function TeacherAttendance() {
  const { data: coursesData, isLoading: coursesLoading } = useGetMyCourses();
  const courses = (coursesData as { id: string; name: string }[] | undefined) ?? [];

  const [selectedCourse, setSelectedCourse] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [attendance, setAttendance] = useState<AttendanceResponse | null>(null);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attError, setAttError] = useState<string | null>(null);
  const [overrideLoading, setOverrideLoading] = useState<Record<string, boolean>>({});

  const fetchAttendance = useCallback(async () => {
    if (!selectedCourse) return;
    setLoadingAttendance(true);
    setAttError(null);
    try {
      const res = await fetch(
        `/api/attendance/live-class?course_id=${encodeURIComponent(selectedCourse)}`,
        { headers: authHeaders() }
      );
      if (!res.ok) {
        const json = await res.json();
        setAttError(json.error ?? "Failed to load attendance");
        setAttendance(null);
      } else {
        setAttendance(await res.json());
      }
    } catch {
      setAttError("Network error");
    } finally {
      setLoadingAttendance(false);
    }
  }, [selectedCourse, selectedDate]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  async function handleOverride(studentId: string, attendanceId: string | null, newStatus: "present" | "absent") {
    if (!selectedCourse) return;
    setOverrideLoading((prev) => ({ ...prev, [studentId]: true }));
    try {
      if (attendanceId) {
        // Update existing record
        await fetch(`/api/attendance/${attendanceId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ status: newStatus }),
        });
      } else {
        // Create via existing course attendance endpoint
        await fetch(`/api/courses/${selectedCourse}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({
            studentId,
            sessionDate: selectedDate,
            status: newStatus,
          }),
        });
      }
      await fetchAttendance();
    } catch {
      // silently refresh
      await fetchAttendance();
    } finally {
      setOverrideLoading((prev) => ({ ...prev, [studentId]: false }));
    }
  }

  const pct =
    attendance && attendance.total_enrolled > 0
      ? Math.round((attendance.total_checked_in / attendance.total_enrolled) * 100)
      : 0;

  return (
    <TeacherLayout>
      <div className="px-6 pt-4 pb-0">
        <Link href="/dashboard/teacher">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </button>
        </Link>
      </div>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-gray-500 text-sm mt-1">View and manage student attendance per class session.</p>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-5 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1">
              <Label>Course</Label>
              {coursesLoading ? (
                <Skeleton className="h-9 w-full" />
              ) : (
                <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a course..." />
                  </SelectTrigger>
                  <SelectContent>
                    {courses.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-44"
              />
            </div>

            <div className="flex items-end">
              <Button onClick={fetchAttendance} disabled={!selectedCourse || loadingAttendance} variant="outline">
                {loadingAttendance ? "Loading..." : "Refresh"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary */}
        {attendance && !loadingAttendance && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {attendance.total_checked_in} / {attendance.total_enrolled} students checked in ({pct}%)
              </CardTitle>
              <CardDescription>
                {selectedDate === todayISO() ? "Today's session" : `Session on ${selectedDate}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className="bg-green-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Attendance Table */}
        {!selectedCourse && (
          <p className="text-gray-500 text-sm">Select a course to view attendance.</p>
        )}

        {selectedCourse && loadingAttendance && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        )}

        {attError && (
          <p className="text-red-600 text-sm">{attError}</p>
        )}

        {attendance && !loadingAttendance && (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Check-in Time</TableHead>
                  <TableHead className="text-right">Override</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendance.students.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No students enrolled in this course.
                    </TableCell>
                  </TableRow>
                )}
                {attendance.students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.name ?? "—"}</TableCell>
                    <TableCell className="text-gray-500 text-sm">{student.unique_student_id ?? "—"}</TableCell>
                    <TableCell>
                      {student.checked_in ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200">Present</Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-500">Not checked in</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-gray-500 text-sm">{formatTime(student.checked_in_at)}</TableCell>
                    <TableCell className="text-right space-x-2">
                      {overrideLoading[student.id] ? (
                        <span className="text-xs text-gray-400">Updating...</span>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant={student.checked_in ? "outline" : "default"}
                            className={student.checked_in ? "" : "bg-green-600 hover:bg-green-700 text-white"}
                            onClick={() => handleOverride(student.id, student.attendance_id, "present")}
                            disabled={student.checked_in}
                          >
                            Mark Present
                          </Button>
                          <Button
                            size="sm"
                            variant={!student.checked_in ? "outline" : "destructive"}
                            onClick={() => handleOverride(student.id, student.attendance_id, "absent")}
                            disabled={!student.checked_in}
                          >
                            Mark Absent
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>
    </TeacherLayout>
  );
}
