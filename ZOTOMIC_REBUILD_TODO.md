# ZOTOMIC REBUILD — TODO & PROGRESS

Full functional rebuild into the multi-tenant business-intelligence SaaS described in the 3 architecture docs + 4 reference mockups.
Update the checkboxes as work completes. One `[x]` per finished item; mark a phase `✅ DONE` in its heading when every box is checked.

**Confirmed decisions:** full functional rebuild · keep custom JWT auth (`lib/auth.ts`) · delete out-of-scope trees · English only (translation-ready) · Hermes = gateway + stub · Gemini AI adapter · Supabase pg_cron + Edge Functions · payment/courier = interfaces + bKash sandbox, rest stubbed · storefront: one universal config-driven theme, `<slug>.zotomic.store` subdomain, section-form editor, guest checkout, verified-buyer reviews, self-hosted curated fonts · mobile-first · LLM-crawlable · Lighthouse budget in repo.

Design tokens: bg `#F1F5F9` · white cards · border `#E8EDF2` · radius 14–16px · primary green `#15803D`/`#22C55E` · navy `#0F2A47` · up `#16A34A` / down `#DC2626` / warn `#D97706` · tenant sidebar light, admin sidebar dark navy · Inter + Lucide + Recharts · NO purple.

---

## PHASE 0 — Foundation  ✅ CODE DONE (migration apply pending Supabase keys)

- [~] `git init` — SKIPPED per user decision (proceed without version control)
- [x] Supabase — keys in `.env.local`; migrations applied to remote (`npx supabase db push`), seed loaded (`--include-seed`). 24 P0 tables live. Auth E2E verified: owner→/app, admin→/admin, /api/auth/me returns user+business.
- [x] Git — `git init` (main), Phase 0 committed, pushed to `github.com/zotomic-com/zotomic`. `.env.local` + credentials memory confirmed NOT tracked. Deleted stale `.github/workflows/setup-env.yml` (had a hardcoded key).
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

## PHASE 1 — Public site + auth + onboarding  ✅ MOSTLY DONE

- [x] Marketing shell — left-sidebar desktop nav (Home/Intelligence/Assistant/Storefront/Pricing · About/Contact/Help) + mobile top bar (`components/site/MarketingShell` + `SiteFooter` + `marketing-nav`)
- [x] Homepage — headline + FlowDiagram (YOUR BUSINESS → Website/Orders/Customers → INTELLIGENCE → Reports/Assistant → ACTION) + SEE/UNDERSTAND/ACT + trust footer. Responsive. JSON-LD.
- [~] Homepage pixel-polish vs mockup — structure + content match; fine-tuning (exact spacing, connector lines) can revisit
- [x] `/intelligence`, `/assistant`, `/storefront` — marketing pages
- [x] `/how-it-works`, `/features` — marketing pages
- [x] `/pricing` — config-driven from `lib/plans.ts` (Free/Business/Pro)
- [x] `/about`, `/contact` (new form → `/api/contact`), `/help` (FAQ)
- [x] `/privacy-policy`, `/terms`, `/refund-policy` — render correctly via CSS var aliases; `/data-deletion` rewritten to new form → `/api/contact`
- [x] `/login`, `/signup` — design system, error states (done Phase 0). `/forgot-password` — placeholder (real reset flow deferred)
- [x] Auth API — signup creates `owner` user → `/onboarding`; login role-routes; `/api/auth/me` returns user + businesses
- [x] `/onboarding` — 3-step (name/type → currency/timezone → data path, skippable) → `POST /api/onboarding` creates business + membership + free subscription + storefront_config + audit log
- [x] First Weekly Intelligence report row queued (`status='queued'`) on onboarding completion
- [x] sitemap + robots updated for new routes; per-page metadata
- [x] E2E verified against live DB: signup → onboarding → business/sub/store/report/audit rows created → `/app` loads
- [ ] Legal page copy is still old agency wording — needs a content pass (cosmetic, low priority)
- [ ] `/forgot-password` real email reset flow

## PHASE 2 — Tenant app (P0)  ✅ CORE DONE

- [x] `/app` dashboard — matches mockup image 4: greeting, insight banner, 4 KPI cards w/ WoW deltas, revenue trend, sales-by-category donut, Ask Zotomic panel, top products, recent orders, tasks, quick actions. Wired to real metrics.
- [x] Deterministic metric service — SQL functions `metrics_summary / metrics_daily_revenue / metrics_sales_by_category / metrics_top_products` (migration `20260829130000`) + `lib/metrics.ts` (period-over-period, profit via buying_price+marketing_cost, cost-completeness gating) + `lib/observations.ts` (rule-based anomaly/threshold observations)
- [x] `/app/intelligence` — SEE (metrics) / UNDERSTAND (deterministic observations w/ severity) / ACT (recommendations from DB, empty-state). Cold-start state.
- [x] `/app/reports` — history list with status badges
- [x] `/app/products` — list + search + add/edit via server actions (`actions.ts`), buying_price/marketing_cost fields, "missing cost" warning, audit log
- [x] `/app/orders` — list + status filter tabs + 7-day aggregates, COD/payment column
- [x] `/app/customers` — list + repeat-customer/lifetime-revenue aggregates, minimal PII
- [x] `/app/tasks` — add + check-off via server actions, priority, assistant-source badge
- [x] `/app/notifications` — list + empty state
- [x] `/app/settings` — business profile form (server action + audit) + account card
- [~] `/app/marketing` — still Phase-0 placeholder (fine — P2 feature)
- [x] Loading/empty/insufficient-data/error states across pages; `force-dynamic` on data pages
- [x] Seed expanded: 40 customers + 230 orders + 462 order_items for Rahman Fashion (deterministic RNG) so the dashboard renders real numbers
- [x] `lib/tenant-server.ts` (`getTenant()` for RSC) + `lib/app-actions.ts` (`requireBusiness()` + `writeAudit()`) + `components/ui/modal.tsx` + `components/app/*`
- [x] Build green (54 routes); all 10 /app pages return 200 against live DB, no runtime errors
- [ ] Product reviews moderation UI — deferred to Phase 4b (reviews don't exist until storefront)
- [ ] Business switcher (multi-business) — deferred (v1 = one business per owner)
- [ ] App layout still shows a brief full-screen spinner before rendering server content — minor UX polish TODO

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
- 2026-08-29 — Phase 0 code complete. ~150 out-of-scope files deleted; new design system, component kit, 3 layout shells, P0 migration + RLS, tenant/auth libs, middleware, seed, Lighthouse config all in. `npx next build` green.
- 2026-08-29 — Supabase keys received. Migrations + seed applied to remote (24 tables live). Git initialised + Phase 0 pushed to github.com/zotomic-com/zotomic (branch main). Vercel wiring deferred (CLI unresponsive in this env; will do at Phase 1 checkpoint).
- 2026-08-29 — Phase 1: marketing shell + homepage + 11 public pages + config-driven pricing + 3-step onboarding + onboarding API. Build green (47 routes). Full signup→onboarding→/app flow verified against live DB.
- 2026-08-29 — Vercel: NEW working token + project (`zotomic` / team `zotomic-com-5624s-projects` / `prj_aqgDRddWwjCkkT801vwvDd9gfz43`), git-connected to the repo, Supabase integration already points at `tmrxlholjvdchgwgluar` (verified). Added AUTH_JWT_SECRET, ENCRYPTION_KEY, NEXT_PUBLIC_SITE_URL, STOREFRONT_ROOT_DOMAIN. Production: https://zotomic-lilac.vercel.app — new build LIVE (homepage + /how-it-works verified via WebFetch). NOTE: this sandbox's curl can't reach Vercel's `64.29.x` IP range, so live authed-flow (login/dashboard) is UNVERIFIED — user should confirm.
- 2026-08-29 — Phase 2: dashboard (mockup image 4) + metric SQL functions + lib/metrics + lib/observations + intelligence/reports/products/orders/customers/tasks/settings/notifications. Seed expanded (40 customers / 230 orders). Build green (54 routes), all /app pages 200 vs live DB. Pushed → auto-deployed (dpl_2iq64S8a5... READY).
- NEXT: Phase 3 (Weekly Intelligence engine — pg_cron + Edge Function + Gemini narrative). Also pending: move zotomic.com domain to the new project; verify live auth.
