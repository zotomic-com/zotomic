import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Zotomic's refund policy for subscription plans.",
};

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      updated="August 2026"
      sections={[
        {
          h: "Free plan",
          p: ["The Free plan costs nothing, so there is nothing to refund."],
        },
        {
          h: "Paid plans — 7-day window",
          p: [
            "If you upgrade to a paid plan and are not satisfied, contact us within 7 days of the payment we confirmed and we will refund that payment in full. This applies once per business.",
          ],
        },
        {
          h: "After 7 days",
          p: [
            "Paid plans are billed per cycle and are not pro-rated or refunded after the 7-day window. You can cancel any time from the billing page; your plan stays active until the end of the current paid period, after which the account moves to Free.",
          ],
        },
        {
          h: "Storefront orders",
          p: [
            "Refunds for products bought on a store's storefront are handled by that store owner under their own policy — Zotomic is not the merchant of record for storefront sales.",
          ],
        },
        {
          h: "How to request",
          p: [
            "Email hello@zotomic.com from your account email with your business name and the transaction reference. Refunds are returned via the original payment method where possible, otherwise by bank/bKash transfer, within 10 business days.",
          ],
        },
      ]}
    />
  );
}
