import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { ParentLayout } from "@/components/layout/ParentLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Wallet } from "lucide-react";
import { apiJson, day, itemLabel, money, type StatementPayload } from "@/components/accounting/shared";
import { BalanceSummary, PaymentHistory, PaymentInstructions } from "@/components/accounting/TuitionStatementView";

interface Child {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

const ITEM_STATUS: Record<string, string> = { paid: "Paid", partial: "Part paid", pending: "Unpaid" };

/** A parent's view of each linked student's balance, schedule and receipts. */
export default function ParentTuition() {
  const search = useSearch();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [childId, setChildId] = useState<string | null>(new URLSearchParams(search).get("student"));
  const [data, setData] = useState<StatementPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiJson<Child[]>("/api/parents/my-children")
      .then((kids) => {
        setChildren(kids);
        setChildId((cur) => (cur && kids.some((k) => k.id === cur) ? cur : kids[0]?.id ?? null));
      })
      .catch(() => setChildren([]));
  }, []);

  useEffect(() => {
    if (!childId) return;
    setData(null);
    setError(null);
    apiJson<StatementPayload>(`/api/tuition/students/${childId}/statement`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [childId]);

  const child = children?.find((c) => c.id === childId);
  const name = child ? `${child.firstName ?? ""} ${child.lastName ?? ""}`.trim() : "";

  return (
    <ParentLayout>
      <div className="space-y-5">
        <Link href="/dashboard/parent" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Back to overview
        </Link>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" />Tuition</h1>
          <p className="text-muted-foreground text-sm">Balance, payment schedule and receipts{name ? ` for ${name}` : ""}.</p>
        </div>
        {children && children.length > 1 && (
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Choose a student">
            {children.map((c) => (
              <Button key={c.id} size="sm" variant={c.id === childId ? "default" : "outline"} onClick={() => setChildId(c.id)} role="tab" aria-selected={c.id === childId}>
                {c.firstName} {c.lastName}
              </Button>
            ))}
          </div>
        )}
        {children && children.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No students are linked to your account yet.</CardContent></Card>
        ) : error ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">{error}</CardContent></Card>
        ) : !data ? (
          <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-48" /></div>
        ) : data.statement.items.length === 0 && data.entries.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">No tuition on file for {name || "this student"}.</CardContent></Card>
        ) : (
          <>
            <BalanceSummary data={data} />
            <PaymentInstructions data={data} />
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Payment schedule</CardTitle></CardHeader>
              <CardContent>
                <ul className="divide-y rounded-md border text-sm">
                  {data.statement.items.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="font-medium">{itemLabel(i)}</p>
                        <p className={`text-xs ${i.overdue ? "text-destructive" : "text-muted-foreground"}`}>{i.dueDate ? `Due ${day(i.dueDate)}` : ""}{i.overdue ? " · overdue" : ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{money(i.amountCents, i.currency)}</span>
                        <Badge variant={i.status === "paid" ? "default" : "outline"}>
                          {ITEM_STATUS[i.status]}{i.status === "partial" ? ` · ${money(i.remainingCents, i.currency)} left` : ""}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <PaymentHistory data={data} />
          </>
        )}
      </div>
    </ParentLayout>
  );
}
