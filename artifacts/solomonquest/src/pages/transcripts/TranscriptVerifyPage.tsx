import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export default function TranscriptVerifyPage() {
  const [email, setEmail] = useState("");
  const [uid, setUid] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setResult(null);
    try {
      const r = await fetch("/api/transcripts/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internal_email: email, unique_student_id: uid }),
      });
      const data = await r.json();
      if (!r.ok) { setError(data.error || "Not found"); }
      else setResult(data);
    } catch { setError("Request failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <GraduationCap className="h-10 w-10 mx-auto mb-2 text-primary" />
          <CardTitle>Access Your Transcript</CardTitle>
          <p className="text-sm text-muted-foreground">Enter your platform email and unique ID</p>
        </CardHeader>
        <CardContent>
          {!result ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input placeholder="Platform email (e.g. john.d@solomonquest.com)" value={email} onChange={e => setEmail(e.target.value)} required />
              <Input placeholder="Unique ID (e.g. SQ-00123456)" value={uid} onChange={e => setUid(e.target.value)} required />
              {error && <p className="text-destructive text-sm">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "Verifying..." : "View Transcript"}</Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-4">
                <p className="font-semibold">{result.student.name}</p>
                <p className="text-sm text-muted-foreground">{result.student.internalEmail}</p>
                <p className="text-sm text-muted-foreground">ID: {result.student.uniqueId}</p>
              </div>
              {result.transcript.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No transcript records yet.</p>
              ) : (
                <div className="space-y-2">
                  {result.transcript.map((t: any, i: number) => (
                    <div key={i} className="border rounded p-3 text-sm">
                      <div className="font-medium">{t.courses?.title ?? "Course"}</div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>Grade: <span className="font-semibold text-foreground">{t.grade ?? "N/A"}</span></span>
                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                      {t.feedback && <p className="text-muted-foreground mt-1">{t.feedback}</p>}
                    </div>
                  ))}
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={() => setResult(null)}>Check Another</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
