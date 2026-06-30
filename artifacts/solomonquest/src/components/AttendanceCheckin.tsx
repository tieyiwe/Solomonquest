import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LiveCourse {
  id: string;
  name: string;
  class_date: string; // ISO datetime string
}

interface AttendanceCheckinProps {
  courses: LiveCourse[];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface CheckinState {
  [courseId: string]: { loading: boolean; checked_in_at: string | null; error: string | null };
}

export default function AttendanceCheckin({ courses }: AttendanceCheckinProps) {
  const [states, setStates] = useState<CheckinState>({});

  if (!courses || courses.length === 0) return null;

  async function handleCheckin(courseId: string) {
    setStates((prev) => ({
      ...prev,
      [courseId]: { loading: true, checked_in_at: null, error: null },
    }));

    try {
      const token = localStorage.getItem("token") ?? sessionStorage.getItem("token");
      const res = await fetch("/api/attendance/checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ course_id: courseId }),
      });

      const json = await res.json();

      if (!res.ok) {
        setStates((prev) => ({
          ...prev,
          [courseId]: { loading: false, checked_in_at: null, error: json.error ?? "Check-in failed" },
        }));
        return;
      }

      setStates((prev) => ({
        ...prev,
        [courseId]: { loading: false, checked_in_at: json.checked_in_at, error: null },
      }));
    } catch (err) {
      setStates((prev) => ({
        ...prev,
        [courseId]: { loading: false, checked_in_at: null, error: "Network error" },
      }));
    }
  }

  return (
    <div className="space-y-3">
      {courses.map((course) => {
        const state = states[course.id];
        const checkedIn = !!state?.checked_in_at;
        const loading = !!state?.loading;
        const error = state?.error;

        return (
          <Card key={course.id} className="border-orange-300 bg-orange-50">
            <CardContent className="flex items-center justify-between py-4 px-5">
              <div className="flex items-center gap-3">
                <Badge className="bg-red-500 text-white animate-pulse">LIVE</Badge>
                <div>
                  <p className="font-semibold text-gray-900">Live class today!</p>
                  <p className="text-sm text-gray-600">
                    {course.name} at {formatTime(course.class_date)}
                  </p>
                  {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
                </div>
              </div>

              <div className="flex items-center gap-3">
                {checkedIn ? (
                  <span className="flex items-center gap-1.5 text-green-700 font-medium text-sm">
                    <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Checked in at {formatTime(state.checked_in_at!)}
                  </span>
                ) : (
                  <Button
                    onClick={() => handleCheckin(course.id)}
                    disabled={loading}
                    className="bg-orange-500 hover:bg-orange-600 text-white"
                  >
                    {loading ? "Checking in..." : "Check In"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
