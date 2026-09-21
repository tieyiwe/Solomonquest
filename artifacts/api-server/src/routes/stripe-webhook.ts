import { Router, type IRouter } from "express";
import express from "express";
import type Stripe from "stripe";
import { supabaseAdmin } from "../lib/supabase";
import { getStripe, getStripeWebhookSecret, isStripeConfigured } from "../lib/stripe";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Mounted in app.ts BEFORE express.json() — Stripe's signature verification
// needs the exact raw request bytes, and a JSON-parsed-then-restringified
// body will not match the signature Stripe sent.
router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    if (!isStripeConfigured()) {
      res.status(503).json({ error: "Stripe is not connected" });
      return;
    }

    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      res.status(400).json({ error: "Missing Stripe-Signature header" });
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(req.body, signature, getStripeWebhookSecret());
    } catch (err: any) {
      logger.warn({ err }, "Stripe webhook signature verification failed");
      res.status(400).json({ error: `Webhook signature verification failed: ${err?.message}` });
      return;
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as Stripe.Checkout.Session;
        const installmentId = session.metadata?.tuition_installment_id;
        const paymentId = session.metadata?.tuition_payment_id;

        if (installmentId && paymentId) {
          // `checkout.session.completed` also fires for sessions whose payment
          // hasn't actually settled (delayed/async payment methods). Only a
          // session Stripe reports as paid may credit an installment.
          if (session.payment_status !== "paid") {
            logger.info({ sessionId: session.id }, "Stripe checkout session completed but not paid — ignoring");
            res.json({ received: true });
            return;
          }

          // The installment must really belong to the payment named in the
          // metadata — metadata is attacker-influenceable on any connected
          // account, so never trust the pairing.
          const { data: installment } = await supabaseAdmin
            .from("tuition_installments")
            .select("id, status, payment_id, amount_cents, tuition_payments!inner(id, school_id)")
            .eq("id", installmentId)
            .eq("payment_id", paymentId)
            .maybeSingle();

          if (!installment) {
            logger.warn({ paymentId, installmentId }, "Stripe webhook referenced an unknown tuition installment");
            res.json({ received: true });
            return;
          }

          // Checkout sessions for tuition are always created on the school's
          // OWN connected account, so the event must have arrived from that
          // account. Without this, any school admin who connected their own
          // Stripe account could create a $0.50 session on it carrying another
          // school's installment id in the metadata and have the platform mark
          // that student's tuition paid.
          const schoolId = (installment as Record<string, any>).tuition_payments?.school_id as string | undefined;
          const { data: school } = schoolId
            ? await supabaseAdmin.from("schools").select("stripe_connect_account_id").eq("id", schoolId).maybeSingle()
            : { data: null };
          const expectedAccount = school?.stripe_connect_account_id as string | null | undefined;

          if (!expectedAccount || event.account !== expectedAccount) {
            logger.warn(
              { paymentId, installmentId, eventAccount: event.account },
              "Stripe webhook account does not match the school's connected account — ignoring"
            );
            res.json({ received: true });
            return;
          }

          // Idempotency: Stripe retries webhooks (and can deliver the same
          // event more than once). Re-running the update would move paid_at
          // forward, which silently shifts revenue into the wrong month in
          // the P&L report, so an already-paid installment is a no-op.
          if (installment.status === "paid") {
            logger.info({ paymentId, installmentId }, "Stripe webhook replay for an already-paid installment — ignoring");
            res.json({ received: true });
            return;
          }

          await supabaseAdmin
            .from("tuition_installments")
            .update({
              status: "paid",
              paid_at: new Date().toISOString(),
              stripe_payment_intent_id:
                typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null,
            })
            .eq("id", installmentId)
            .neq("status", "paid");

          const { data: installments } = await supabaseAdmin
            .from("tuition_installments")
            .select("status")
            .eq("payment_id", paymentId);

          const allPaid = (installments ?? []).every((i) => i.status === "paid");

          await supabaseAdmin
            .from("tuition_payments")
            .update({
              status: allPaid ? "paid" : "partial",
              provider: "stripe",
              updated_at: new Date().toISOString(),
            })
            .eq("id", paymentId);

          logger.info({ paymentId, installmentId }, "Stripe tuition payment recorded");
        } else {
          logger.warn({ sessionId: session.id }, "Stripe checkout.session.completed missing tuition metadata");
        }
      }

      res.json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Error handling Stripe webhook");
      res.status(500).json({ error: "Webhook handler error" });
    }
  }
);

export default router;
