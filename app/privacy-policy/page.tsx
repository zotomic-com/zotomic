import type { Metadata } from "next";
import { LegalPage } from "@/components/site/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Zotomic collects, uses, and protects your data.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="August 2026"
      sections={[
        {
          h: "1. Who we are",
          p: [
            "Zotomic is a business-intelligence platform for small online businesses, operated from Bangladesh. This policy covers the marketing site (zotomic.com), the application, and the storefronts we host on behalf of business owners.",
          ],
        },
        {
          h: "2. What we collect",
          p: [
            "Account data: your name, email, phone, and password (stored only as a hash).",
            "Business data: the products, orders, customers, and settings you add or import so we can calculate your metrics and generate reports.",
            "Storefront data: orders and events placed on a storefront you publish, including buyer contact and delivery details supplied at checkout.",
            "Usage data: pages viewed, features used, and assistant interactions, used to operate and improve the service.",
            "Third-party credentials you connect (payment gateway, courier) are encrypted with AES-256 and used only to perform the actions you request.",
          ],
        },
        {
          h: "3. How we use it",
          p: [
            "To provide the service: run onboarding, calculate metrics, generate weekly reports, render your storefront, and process storefront orders.",
            "To communicate with you: report deliveries, alerts, billing reminders, and support.",
            "AI features: your calculated figures and rule-based observations are sent to our AI provider (Google Gemini) to write report narratives and power the assistant. We instruct the model to use only the figures provided and never to invent data. Model providers process this under their own terms and do not use it to train their models where their API terms disallow it.",
          ],
        },
        {
          h: "4. Tenant isolation",
          p: [
            "Every business is a separate tenant. Your business data is never pooled with, or shown to, another business. Access is enforced in our application layer and, as a second line of defence, by database row-level security.",
          ],
        },
        {
          h: "5. Sharing",
          p: [
            "We share data only with the processors needed to run the service: our hosting and database provider (Supabase/Vercel), our media provider (Cloudinary), our email and (if you enable it) Telegram delivery, our AI provider, and any payment gateway or courier you connect. We do not sell personal data.",
          ],
        },
        {
          h: "6. Retention",
          p: [
            "We keep your data while your account is active. On deletion we remove your business data, products, orders, customers, and reports within 30 days, except records we are legally required to keep (such as invoices).",
          ],
        },
        {
          h: "7. Your rights",
          p: [
            "You can access, correct, export, or delete your data. Use the in-app settings or the data-deletion request form, or contact us. Storefront buyers can ask the relevant store owner, or contact us and we will route the request.",
          ],
        },
        {
          h: "8. Security",
          p: [
            "Passwords are hashed with bcrypt. Sessions use signed, HTTP-only cookies. Stored third-party credentials are encrypted with AES-256. We use HTTPS everywhere and least-privilege access internally.",
          ],
        },
        {
          h: "9. Changes & contact",
          p: [
            "We may update this policy; material changes will be notified in-app or by email. Questions: hello@zotomic.com.",
          ],
        },
      ]}
    />
  );
}
