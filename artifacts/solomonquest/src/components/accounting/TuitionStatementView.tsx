import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Landmark } from "lucide-react";
import { day, entryEffect, entryTitle, money, STATUS_LABEL, STATUS_STYLE, type StatementPayload } from "./shared";

/**
 * Read-only balance summary, how-to-pay instructions and payment history with
 * receipts. Used on the student Tuition page and the parent Tuition page.
 */
export function BalanceSummary({ data, who = "your" }: { data: StatementPayload; who?: string }) {
  const st = data.statement;
  return (
    <div className="space-y-3" data-testid="balance-summary">
      {st.totals.map((t) => (
        <div key={t.currency} className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <Tile label="Total billed" value={money(t.billedCents, t.currency)} />
          <Tile label="Paid" value={money(t.paidCents, t.currency)} tone="text-success" />
          <Tile label="Discounts" value={money(t.discountCents, t.currency)} />
          <Tile
            label={t.creditCents > 0 ? "Credit" : "Outstanding"}
            value={money(t.creditCents > 0 ? t.creditCents : t.outstandingCents, t.currency)}
            tone={t.outstandingCents > 0 ? "text-destructive" : "text-success"}
            testId="student-outstanding"
          />
        </div>
      ))}
      {st.totals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className={STATUS_STYLE[st.status]}>{STATUS_LABEL[st.status]}</Badge>
          {st.nextDue ? (
            <span className={st.isOverdue ? "text-destructive" : "text-muted-foreground"}>
              Next payment: {money(st.nextDue.amountCents, st.nextDue.currency)}
              {st.nextDue.dueDate ? ` ${st.isOverdue ? "was due" : "due"} ${day(st.nextDue.dueDate)}` : ""}
            </span>
          ) : (
            <span className="text-muted-foreground">Nothing is due. Thank you!</span>
          )}
          {who !== "your" && <span className="text-muted-foreground">({who})</span>}
        </div>
      )}
    </div>
  );
}

export function PaymentInstructions({ data }: { data: StatementPayload }) {
  if (data.onlinePayments || !data.paymentInstructions) return null;
  return (
    <Card className="border-primary/30" data-testid="payment-instructions">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />How to pay {data.schoolName}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm whitespace-pre-wrap break-words">{data.paymentInstructions}</p>
        <p className="mt-2 text-xs text-muted-foreground">Once the school records your payment, it shows below with a receipt.</p>
      </CardContent>
    </Card>
  );
}

export function PaymentHistory({ data }: { data: StatementPayload }) {
  const entries = data.entries;
  return (
    <Card data-testid="payment-history">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payment history</CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {entries.map((e) => (
              <li key={e.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm ${e.voidedAt ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${e.voidedAt ? "line-through" : ""}`}>{entryTitle(e)}</p>
                  <p className="text-xs text-muted-foreground">
                    {day(e.paidOn)}{e.receiptNumber ? ` · ${e.receiptNumber}` : ""}{e.voidedAt ? " · void" : ""}
                  </p>
                </div>
                <span className={`tabular-nums font-medium ${entryEffect(e) < 0 ? "text-success" : ""}`}>{money(Math.abs(e.amountCents), e.currency)}</span>
                {e.receiptNumber && (
                  <Button size="sm" variant="ghost" asChild>
                    <a href={`/receipts/${e.id}`}><FileText className="h-3.5 w-3.5 mr-1" />Receipt</a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({ label, value, tone, testId }: { label: string; value: string; tone?: string; testId?: string }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-xl sm:text-2xl font-semibold tabular-nums ${tone ?? ""}`} data-testid={testId}>{value}</p>
      </CardContent>
    </Card>
  );
}
