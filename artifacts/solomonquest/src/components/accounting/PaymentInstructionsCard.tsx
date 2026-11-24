import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiJson } from "./shared";

const MAX = 2000;

/** School setting: how to pay while online payment isn't connected. */
export function PaymentInstructionsCard() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState("");
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson<{ paymentInstructions: string; onlinePayments: boolean }>("/api/accounting/payment-instructions")
      .then((d) => {
        setValue(d.paymentInstructions ?? "");
        setSaved(d.paymentInstructions ?? "");
        setOnline(d.onlinePayments);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const d = await apiJson<{ paymentInstructions: string }>("/api/accounting/payment-instructions", {
        method: "PUT",
        body: JSON.stringify({ paymentInstructions: value }),
      });
      setSaved(d.paymentInstructions);
      setValue(d.paymentInstructions);
      toast.success("Payment instructions saved");
    } catch (e: any) {
      toast.error(e.message || "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment instructions</CardTitle>
        <CardDescription>
          Shown on each student's Tuition page and in balance reminders{online ? " (while online payment is connected, reminders link to Pay instead)" : ""}.
          Include bank details, mobile money numbers and where to pay cash.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <Skeleton className="h-32" />
        ) : (
          <>
            <Label htmlFor="payment-instructions" className="sr-only">Payment instructions</Label>
            <Textarea
              id="payment-instructions"
              rows={6}
              maxLength={MAX}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={"Bank transfer: First Bank, account 0123456789 (Westbrook Academy). Use the student's name as the reference.\nCash: the bursar's office, Mon–Fri 9am–4pm."}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{value.length}/{MAX}</span>
              <Button onClick={save} disabled={saving || value === saved}>
                {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
