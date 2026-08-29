# ZOTOMIC REBUILD — TODO & PROGRESS

Full functional rebuild into the multi-tenant business-intelligence SaaS described in the 3 architecture docs + 4 reference mockups.
Update the checkboxes as work completes. One `[x]` per finished item; mark a phase `✅ DONE` in its heading when every box is checked.

**Confirmed decisions:** full functional rebuild · keep custom JWT auth (`lib/auth.ts`) · delete out-of-scope trees · English only (translation-ready) · Hermes = gateway + stub · Gemini AI adapter · Supabase pg_cron + Edge Functions · payment/courier = interfaces + bKash sandbox, rest stubbed · storefront: one universal config-driven theme, `<slug>.zotomic.store` subdomain, section-form editor, guest checkout, verified-buyer reviews, self-hosted curated fonts · mobile-first · LLM-crawlable · Lighthouse budget in repo.

Design tokens: bg `#F1F5F9` · white cards · border `#E8EDF2` · radius 14–16px · primary green `#15803D`/`#22C55E` · navy `#0F2A47` · up `#16A34A` / down `#DC2626` / warn `#D97706` · tenant sidebar light, admin sidebar dark navy · Inter + Lucide + Recharts · NO purple.

---

## PHASE 0 — Foundation  ✅ CODE DONE (migration apply pending Supabase keys)

- [~] `git init` — SKIPPED per user decision (proceed without version control)
- [ ] Supabase access — user to paste real keys into `.env.local`; then run `npx supabase db push` + `db reset` for seed
- [x] New `globals.css` design tokens (light/dark), removed all purple utilities
- [x] `tailwind.config.ts` — green/navy palette, radius, shadows, fonts
- [x] Shared component kit: Button, Card, StatCard, Badge, DataTable, EmptyState, Skeleton, Toast, Tabs, Select, Field/Input/Textarea/Label (`components/ui/*`)  — Modal deferred to first use
- [x] Chart wrappers (Recharts): LineChart, BarChart, DonutChart — themed via CSS vars, lazy-loaded (`components/charts/*`)
- [x] Layout shell: public (`components/Navbar` + `Footer` + `ConditionalLayout`, new design system)
- [x] Layout shell: `/app` (light sidebar + topbar + business context, `app/app/layout.tsx`)
- [x] Layout shell: `/admin` (dark navy sidebar + topbar, `app/admin/layout.tsx`)
- [x] Shared `Sidebar` / `Topbar` / `nav.ts` (`components/app-shell/*`), `Logo`, `PagePlaceholder`
- [x] Delete out-of-scope: `app/admin/*`, `app/vendor`, `app/affiliate`, `app/store`, `app/templates`, `app/blog`, `app/dashboard`, `app/services`, `app/api/{admin,vendor,affiliate,user,blog,ai,chat,webhooks}`
- [x] Delete out-of-scope components: Hero, Features, Pricing, OurWorks, Testimonials, CTABanner, CursorGlow, WhatsAppButton, ZotomicChatWidget
- [x] Delete stale SQL + libs: `lib/db-schema.sql`, `lib/vendor-platform.ts`, `lib/ai.ts`, `lib/ai-engine.ts`, `lib/admin*`, `lib/api.ts`, `lib/middleware.ts`, old agent migration, root `supabase-new-*.sql`, `HANDOFF.txt`, `PROJECT_PLAN_AND_PROGRESS.txt`
- [x] Split auth: `lib/jwt.ts` (edge-safe, jose) + `lib/auth.ts` (bcrypt/AES, node) + `lib/auth-server.ts` (getAuthUser/requireAuth)
- [x] New Supabase migration `supabase/migrations/20260829120000_p0_core.sql` — all P0 tables (users, businesses, business_members, products +buying_price/marketing_cost, customers, orders, order_items, reports, report_metrics, insights, recommendations, subscriptions, invoices, integrations, audit_logs, tasks, notifications, assistant_conversations, assistant_messages, usage_ledger, storefront_config, storefront_events, product_reviews, contact_messages)
- [x] RLS enabled on every table + `app.current_business_id()` GUC tenant policies; service_role-only access, deny-by-default for anon/authenticated
- [x] `lib/tenant.ts` — `resolveTenant(req)` → `{ user, businessId, role }` from session only
- [x] `middleware.ts` — `/app`, `/onboarding`, `/admin` protection + role routing (storefront hostname resolution deferred to Phase 4a)
- [x] Auth API routes updated for new model (`owner` role, business membership, `/onboarding` redirect)
- [x] Seed script `supabase/seed.sql` (labelled demo data: admin + Rahman Fashion owner + products)
- [x] Lighthouse CI config `.lighthouserc.json` (storefront budget: Perf ≥95, A11y/BP/SEO 100)
- [x] `.env.local.example` rewritten (Gemini, Cloudinary, Hermes, storefront domain, JWT/encryption keys, bKash sandbox)
- [x] Build passes clean (`npx next build` — no errors, no edge-runtime warnings)
- [x] App-route stub pages for every `/app/*` and `/onboarding` + `/admin` (PagePlaceholder, tagged with target phase)

## PHASE 1 — Public site + auth + onboarding

- [ ] Homepage — desktop (image 2) pixel-close
- [ ] Homepage — mobile (image 1 & 3) pixel-close
- [ ] `/how-it-works`
- [ ] `/features`
- [ ] `/pricing` (config-driven plans)
- [ ] `/storefront` (marketing)
- [ ] `/about`, `/contact` (restyled)
- [ ] `/privacy`, `/terms`, `/refund-policy`, `/data-deletion` (restyled)
- [ ] `/login`, `/signup`, `/forgot-password` — new design system, full states
- [ ] Auth API wired (reuse `app/api/auth/*`), business creation on signup
- [ ] `/onboarding` — business name/type → currency/timezone → data path (FB / manual / CSV, skippable) → readiness check
- [ ] First Weekly Intelligence report queued on onboarding completion
- [ ] JSON-LD + metadata + sitemap + robots for public site

## PHASE 2 — Tenant app (P0)

- [ ] `/app` dashboard — pixel-close to image 4, wired to real metrics
- [ ] Deterministic metric service (revenue, orders, returns, estimated profit, period-over-period, anomaly/threshold detection)
- [ ] `/app/intelligence` — SEE / UNDERSTAND / ACT, evidence vs recommendation, cold-start state
- [ ] `/app/reports` — history, detail, filters, underlying insights
- [ ] `/app/products` — list/search/filter/detail, buying_price + marketing_cost, controlled edits, review moderation
- [ ] `/app/orders` — list/search/detail + aggregates, COD/gateway status
- [ ] `/app/customers` — search + aggregate intelligence, minimal PII
- [ ] `/app/tasks` — user + assistant-generated tasks, priority
- [ ] `/app/notifications` — report-ready, alerts, system
- [ ] `/app/settings` — business, user, security, notification, AI prefs, AI-crawler toggle
- [ ] `/app/marketing` — design-consistent placeholder (P2)
- [ ] All screens: loading / empty / insufficient-data / error / permission states

## PHASE 3 — Weekly Intelligence engine

- [ ] Ingestion: manual entry + CSV import
- [ ] Ingestion: Facebook Page connect (data pull)
- [ ] Normalize layer
- [ ] Supabase Edge Function: report generation pipeline
- [ ] pg_cron schedule + "businesses due" selector
- [ ] Gemini narrative adapter (2.5-flash → 2.0-flash → 2.0-flash-lite fallback)
- [ ] Structured output: type / severity / evidence / recommendation / confidence
- [ ] Persist Report + ReportMetric + Insight + Recommendation
- [ ] Notify: dashboard + email (Brevo) + optional WhatsApp
- [ ] Cold-start handling (states what's missing, never guesses)
- [ ] Admin surfacing of failed report jobs

## PHASE 4a — Storefront theme + editor

- [ ] `packages/storefront-theme` — component library + `StorefrontConfig` types + Zod schema + defaults
- [ ] Hostname routing: middleware resolves `<slug>.zotomic.store` → business_id → internal rewrite
- [ ] Public renderer route group — SSR + ISR + per-tenant revalidateTag
- [ ] Home section catalog: hero, featured products, category grid, product grid, image+text, about, testimonials, FAQ, newsletter, contact/map, logo strip
- [ ] Pages: Home, Shop (all + collection), Product detail, About, Contact, Policies, Search, 404, Coming-soon
- [ ] Product detail: rich description, spec table, shipping/returns accordion, related products, reviews block
- [ ] Wishlist (localStorage) + `/wishlist` page + share link
- [ ] Configurable footer menu (link columns, newsletter, badges, social)
- [ ] `/app/storefront` section-form editor + live preview iframe
- [ ] Draft/published + version history + revert + publish → AuditLog + revalidate
- [ ] Self-hosted curated fonts via next/font
- [ ] JSON-LD (Organization, WebSite, BreadcrumbList, Product, ItemList, FAQPage, LocalBusiness)
- [ ] Per-store `/llms.txt`, sitemap.xml, robots.txt (AI crawlers allowed + opt-out)
- [ ] Lighthouse: storefront 100/100/100/100 verified

## PHASE 4b — Media + commerce

- [ ] Cloudinary media pipeline: browser compress/validate → upload → URL+metadata in Supabase
- [ ] `/app/media` — management + cleanup + reference tracking
- [ ] Cart (drawer + page, server cart id + localStorage)
- [ ] Guest checkout — contact + address + delivery + payment method
- [ ] COD order path → upsert Customer + write Order/OrderItem
- [ ] Order confirmation page + email + optional WhatsApp + tracking link
- [ ] Storefront events (page_view, product_view, add_to_cart, add_to_wishlist, begin_checkout, purchase) → `storefront_events` + tracking adapter
- [ ] Verified-buyer review flow: post-delivery email link → submit → owner moderation
- [ ] Meta Pixel (free tier, client-side)

## PHASE 5 — Admin console

- [ ] `/admin` overview — pixel-close to image 3
- [ ] `/admin/tenants` — list, detail, suspend/impersonate (audit-logged)
- [ ] `/admin/subscriptions` — pending-confirmation queue + one-click "mark paid" + lock state machine
- [ ] `/admin/financials` — MRR, revenue, invoices
- [ ] `/admin/usage` — AI credits, storage, bandwidth per tenant
- [ ] `/admin/websites` — published storefronts + domains
- [ ] `/admin/reports` — report/job monitoring, failed jobs surfaced
- [ ] `/admin/assistant-activity` — Hermes tool-call logs, usage, errors
- [ ] `/admin/integrations` — platform-level provider config
- [ ] `/admin/content-library`, `/admin/marketing` — placeholders (Outreach Agent later)
- [ ] `/admin/users` — roles/permissions
- [ ] `/admin/audit-logs` — subscription/credential/admin-on-customer-data actions
- [ ] `/admin/system-health` — uptime/latency, background-job health
- [ ] `/admin/settings` — platform config, plan/limit definitions
- [ ] Billing automation: invoice generation + payment reference code
- [ ] Reminders: 3 days before due / on due date / mid-grace
- [ ] Grace (7d) → soft-lock (day 8, dashboard read-only, storefront live) → hard-lock (day 30, storefront offline)
- [ ] Instant reactivation on admin "mark paid"

## PHASE 6 — Assistant + Hermes tool layer

- [ ] `packages/zotomic-tools` — definitions + schemas + handlers + registry
- [ ] 17 V1 tools implemented (read: profile, settings, products, product, orders, order summary, customers, customer summary, metrics, insights, alerts, latest report, report insights, list tasks; write: create task; controlled: update product, update business settings)
- [ ] Per-tool: input/output schema, authz check, tenant scoping, validation, error contract, timeout, audit event, credit/usage event
- [ ] Agent Gateway: `POST /api/assistant/messages` — auth → tenant → plan/credits/rate-limit/policy → dispatch
- [ ] `POST /api/assistant/tool-exec` — tenant context by taskId, re-check policy, run handler, structured result
- [ ] Confirmation flow for consequential writes (needs_confirmation → approve token)
- [ ] Audit log + usage ledger writes on every tool call
- [ ] Hermes adapter (HTTP client, shared-secret auth, IP allowlist) + fake-Hermes test client
- [ ] `/app/assistant` chat UI — context-aware entry, tool-activity display, confirmation UI, Hermes-unavailable state
- [ ] E2E tests: authorized + unauthorized access, hallucinated business_id rejected, reproducible metrics

## PHASE 7 — P1 adapters (later)

- [ ] PaymentProvider adapter interface + Integration encryption + Settings → Payments UI
- [ ] bKash sandbox reference implementation
- [ ] Nagad / SSLCommerz stubs
- [ ] CourierProvider adapter interface + Settings → Delivery UI
- [ ] Pathao / Steadfast / RedX stubs + Shipment sync
- [ ] Custom domain: DNS verify → SSL provision → active
- [ ] Google server-side tracking + GSC (paid tier, isolated per-store container)
- [ ] Richer notifications + richer intelligence

---

## LOG

- 2026-08-29 — Plan approved. TODO file created. Phase 0 starting.
- 2026-08-29 — Phase 0 code complete. ~150 out-of-scope files deleted; new design system, component kit, 3 layout shells, P0 migration + RLS, tenant/auth libs, middleware, seed, Lighthouse config all in. `npx next build` green. BLOCKED on: user pasting real Supabase keys into `.env.local` so the migration can be applied (`npx supabase db push`) before Phase 1 auth/onboarding wiring can be tested end-to-end.
