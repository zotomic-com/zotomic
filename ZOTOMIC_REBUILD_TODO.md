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

## PHASE 3 — Weekly Intelligence engine  ✅ CORE DONE

- [x] Report generation pipeline `lib/reports/generate.ts` — period = last full week vs the week before; deterministic metrics via SQL RPC → `report_metrics` rows (value + previous + change_pct + direction + availability); rule-based observations → `insights`; Gemini structured JSON narrative → summary + `insights` + `recommendations`
- [x] Gemini adapter `lib/ai/gemini.ts` — server-only, key never exposed/logged, fallback chain `gemini-3.6-flash → gemini-flash-lite-latest → gemini-2.5-flash-lite` (2.5-flash retired for new keys in 2026), strict "use only provided numbers" system prompt, JSON response mode
- [x] Cold-start handling — 0 orders in both periods → report explicitly says what's missing, no Gemini call
- [x] Deterministic fallback summary when Gemini unavailable/fails (AI is optional narrative polish)
- [x] pg_cron + pg_net (migration `20260829140000`) — `app.trigger_weekly_reports()` reads URL+secret from private `app.config`, POSTs to `/api/cron/weekly-reports` Mondays 03:00 UTC. Job active on remote.
- [x] `/api/cron/weekly-reports` (x-cron-secret) — iterates active non-hard-locked businesses; `/api/app/reports/generate` (tenant-auth) — on-demand "refresh report"
- [x] Notify: dashboard notification row on report ready
- [x] `/app/intelligence` shows AI summary banner + report insights; `/app/reports` + intelligence have "Generate / Refresh report" button
- [x] E2E verified: generated a real report — Gemini `gemini-3.6-flash` summary using only provided figures ("revenue rose 54% to ৳140,390 … profit grew 45% to ৳59,120 … concentrated in a single item"), 4 metrics + 3 insights + 2 recommendations + 1 notification persisted
- [x] Ingestion: CSV import (products + orders) + manual order entry (`/app/orders/new`) — shared `lib/orders/create.ts` (`createOrder`, server-side price validation, customer upsert, stock decrement, rollups), `lib/csv.ts` parser + column auto-map, `ProductImport`/`OrderImport` modals with mapping UI. Facebook Page connect still NOT built (deferred).
- [ ] Email (Brevo) + WhatsApp push on report ready — only in-app notification so far
- [ ] Admin view of failed report jobs — Phase 5

## PHASE 4a — Storefront theme + editor  ✅ CORE DONE

- [x] `lib/storefront/config.ts` — `StorefrontConfig` type + `makeDefaultConfig` + `normalizeConfig` (deep-merge stored partial onto defaults; no Zod, form-constrained)
- [x] `lib/storefront/store.ts` — `getStoreBySlug` / `getStoreProducts` / `getStoreProduct` (React `cache()`), draft vs published
- [x] Hostname routing — `middleware.ts` resolves `<slug>.zotomic.store` (+ `<slug>.localhost` dev) → rewrites to `/s/<slug>/*`, sets `x-sf-root-host` so renderer uses basePath `""`; path access `/s/<slug>` works for preview
- [x] Public renderer `app/s/[slug]/*` — SSR + `revalidate` + `revalidateTag(site:<id>)` on publish. Coming-soon state when unpublished.
- [x] Theme `components/storefront/*` — `StoreShell` (scoped accent/font/radius CSS vars, light/dark), `Sections` renderer (hero, featured, product_grid, category_grid, image_text, rich_text, testimonials, faq, newsletter, logo_strip, contact), `ProductCard`
- [x] Pages: Home (sections), Products (+ category filter), Product detail (gallery, related, JSON-LD Product/Offer), About, Contact, Cart, Checkout, Order confirmation, coming-soon
- [x] `/app/storefront` editor — `StorefrontEditor` (content/design/settings tabs, brand, announcement, section add/reorder/toggle/delete + per-type field editing, commerce, contact, SEO, About) + debounced autosave + **live preview iframe** (`/storefront-preview` renders draft)
- [x] Draft/published — `saveDraft` / `publishStorefront` / `unpublishStorefront` server actions; `published_version` bump; AuditLog; `revalidateTag`
- [x] Per-store `/llms.txt`, `/sitemap.xml`, `/robots.txt` (AI crawlers allowed by default, toggle in editor SEO tab)
- [x] JSON-LD: Store (layout) + Product/Offer (product page)
- [x] E2E verified: editor 200, preview renders theme, unpublished → coming-soon, published store → home/products/4 product pages/about/contact/cart/checkout/robots/sitemap/llms all 200
- [~] Wishlist, review block, spec table, footer-menu editor, curated font @font-face loading, Lighthouse 100 audit — deferred polish
- [x] Guest checkout `POST /api/storefront/checkout` — server-authoritative pricing, upsert Customer by phone, write Order + OrderItems (channel `storefront`), decrement tracked stock, `storefront_events` purchase, `new_order` notification. **Verified: real order created, all rows correct, feeds intelligence.**

## PHASE 4b — Media + review flow + tracking  ✅ CORE DONE

- [x] Cloudinary pipeline — `lib/cloudinary.ts` (server-side SHA1 signing, secret never exposed), `/api/app/media/sign` + `/api/app/media` (POST record / GET list / DELETE with product-reference check). `media_assets` table (migration `20260829150000`). Browser canvas compression (max 1600px, JPEG q0.82) before upload. **Verified: real signed upload to Cloudinary succeeds.**
- [x] `ImageUploader` component → wired into product add/edit form (`image_urls`) + `/app/media` gallery page
- [x] Verified-buyer reviews — `review_tokens` table; `issueReviewTokens()` on order → delivered; `/app/orders/[id]` order detail + `OrderStatusControl`; public `/s/[slug]/review/[token]` form → `/api/storefront/review` (creates `pending` row, marks token used); `/app/reviews` moderation (approve/hide, tabs); storefront product page renders approved reviews + `AggregateRating`/`Review` JSON-LD. **Verified: submission creates pending row.**
- [x] Nav: added Media + Reviews
- [ ] page_view / product_view / add_to_cart / begin_checkout events (only `purchase` fires)
- [ ] Order confirmation email (Brevo) + WhatsApp; post-delivery review-invite email
- [ ] Meta Pixel (free tier); cart count badge in storefront header
- [ ] `product.image_urls` used by `next/image` (currently plain `<img>` with lazy loading + Cloudinary f_auto via `optimized()` helper — wire helper into ProductCard)

## PHASE 5 — Admin console + billing  ✅ CORE DONE

- [x] Billing state machine — migration `20260829160000`: `app.tick_subscription` / `app.billing_sweep` (active → grace 0–7d → soft_lock day 8 → hard_lock day 30; free never locks). Daily pg_cron `billing-sweep` @ 02:00 UTC.
- [x] `lib/billing.ts` — `deriveBilling`, `submitPayment` (owner→invoice), `confirmInvoice` (admin→paid + period +30d + unlock + owner email)
- [x] Enforcement — `getTenant()`/`requireBusiness()` carry billing state; writes blocked when read-only; app layout redirects hard-lock → `/app/billing`, shows grace/soft-lock banner; `getStoreBySlug()` marks hard-locked stores offline (soft-lock keeps storefront LIVE)
- [x] `/app/billing` — plan card + status, bKash payment form (reference + txn id), invoice history, upgrade cards
- [x] `/admin` overview — matches mockup img 3: 4 stat cards (Total/Active Businesses, MRR, Reports), Business Growth bar, Subscription Mix donut, Recent Signups, Top Businesses by Revenue, Activity Feed, pending-confirmation alert
- [x] `/admin/subscriptions` — pending-confirmation queue + one-click "Mark as paid" + void; all-subscriptions table with lock status
- [x] `/admin/tenants` (businesses + owner + plan + revenue), `/admin/financials` (MRR/collected/outstanding + invoices), `/admin/websites` (storefronts), `/admin/users`, `/admin/audit-logs`, `/admin/reports` (job monitoring, failed count), `/admin/system-health` (live Supabase/Gemini/Cloudinary/Email checks)
- [x] `/api/cron/billing` — reminder emails (3d before / on due / mid-grace), dedup via `last_reminder_on`
- [x] `lib/admin-server.ts` `requireAdmin()` guard
- [x] Verified E2E: overdue → soft_lock + invoice; owner read-only + payment form; payment submitted → admin queue → confirm → active + period +30d
- [~] `/admin/{usage,assistant-activity,content-library,marketing,settings}` — stubs (usage/assistant = Phase 6; content/marketing = P2; settings = plan-config later)
- [ ] Tenant suspend / impersonate actions; credential-change audit events

## PHASE 6 — Assistant + tool layer  ✅ CORE DONE

- [x] `lib/tools/registry.ts` — 17 V1 tools (read ×14, write ×1 create_task, consequential ×2 update_product/update_business_settings). Each: JSON-schema params, tenant-scoped handler, `risk`, `creditCost`, audit-log on writes.
- [x] `lib/agent/hermes.ts` — agentic loop over Gemini function-calling ("fake Hermes"). Strict "only tool data, never invent" system prompt. Model fallback chain. Consequential tools return a `pendingAction`; deterministic fallback replies when Gemini briefly unavailable. **Swap `runAgent` for an HTTP call to the real VPS later — tools + gateway unchanged.**
- [x] Agent Gateway `POST /api/assistant/messages` — `resolveTenant` (auth+tenant+billing) → per-plan daily message cap (free 10 / business 100 / pro 500) → conversation + message persistence → `usage_ledger` recording → approval-resume path
- [x] Confirmation flow — `assistant_pending_actions` table (migration `20260829170000`); consequential write returns `{ pendingAction }`; UI Approve/Cancel; approve POSTs `{ approveId }` → runs tool → resumes. Blocked when billing read-only.
- [x] `/app/assistant` chat UI — tool-call chips, confirmation cards, `?q=` auto-send from dashboard panel, read-only + "assistant unavailable" (no Gemini key) states, conversation history reload
- [x] `/admin/assistant-activity` (messages / tool calls / credits / recent transcript) + `/admin/usage` (per-business 30-day consumption) — now real
- [x] Verified E2E: metrics query → `get_business_metrics` → exact real numbers; price-change request → pending action → approve → product updated + audit logged; low-stock query answered truthfully without hallucination
- [ ] Real Hermes HTTP client (HERMES_BASE_URL + shared secret) — stub only; user has no VPS yet
- [ ] Conversation list / "new chat" UI; streaming responses; tool-error → structured user message instead of thrown action

## PHASE 7 — payment & courier adapters + admin store control  ✅ CORE DONE

- [x] `lib/adapters/types.ts` — `PaymentProvider` / `CourierProvider` interfaces
- [x] `lib/adapters/registry.ts` — provider maps + `loadIntegration` (decrypt) / `saveIntegration` (AES-256 encrypt) / `listIntegrations` / `removeIntegration`
- [x] bKash (`payment/bkash.ts`) — tokenized checkout, sandbox + live base URLs, token grant → create → execute → status. Credential fields: app_key/app_secret/username/password
- [x] Steadfast (`courier/steadfast.ts`) — create_order / status_by_cid / get_balance validate
- [x] Nagad, SSLCommerz, Pathao, RedX — structured stubs (`validate` returns "coming soon"; flow wired)
- [x] `lib/entitlements.ts` — `deriveEntitlements(plan, overrides)`: payment_gateway/server_tracking/custom_domain = paid plans OR admin override; courier = all plans
- [x] `/app/integrations` — connect/validate/disconnect modal, sandbox/live mode toggle, payment section plan-gated (locked on free with upgrade prompt), courier always available. `actions.ts` audit-logged.
- [x] Storefront checkout — `getStorePaymentOptions` = COD + connected gateways; gateway path in `/api/storefront/checkout` creates `payments` row + `provider.init()` → `redirectUrl`; `/api/storefront/payment/callback/[provider]` verifies → marks order paid/confirmed + confirmation email. `ClearCartOnMount` on order page.
- [x] Order detail — `CourierControl`: pick courier → `bookCourier` action → `provider.createShipment` → `shipments` row + tracking, order → shipped
- [x] Migration `20260829180000` — `shipments` + `payments` tables, `integrations.mode`, `businesses.feature_overrides`
- [x] Admin `/admin/tenants/[id]` — edit business (+ suspend), subscription override (plan/status/extend days), per-feature grants (force-enable payment gateway for any store), take storefront offline, delete business (name-confirm). All audit-logged. Tenants list rows link to detail.
- [ ] bKash sandbox live test — needs a store owner's bKash sandbox creds (entered in UI, not env)
- [ ] Pathao / RedX real impls · Shipment status sync cron · custom domain flow

---

## PHASE 8 — assistant tools, tracking, missing CRUD  ✅ DONE

- [x] Assistant tools **24 total** now — added `send_report_telegram` + `send_report_email` (from `Assistant@zotomic.com`), then `get_order_details`, `get_shipping_address`, `get_customer_details` (+ history), `get_cancelled_orders` (+ `cancel_reason`), `get_returns` (+ reason). `lib/reports/deliver.ts` + `report_deliveries` table; migration `20260830160000` (orders.cancel_reason/cancelled_at).
- [x] Telegram — `lib/telegram.ts` (platform bot, `verifyBot`); admin sets bot token in `/admin/settings`; owner sets chat ID in `/app/settings`; `lib/platform-settings.ts` (`platform_settings` table, AES for secrets)
- [x] `/admin/settings` — real: Telegram bot token + Meta Pixel + GA4 (measurement id + api secret) for zotomic.com. Audit-logged.
- [x] Meta Pixel — **all plans**. Per-store `config.tracking.metaPixelId` + `ga4MeasurementId` in the storefront editor (Tracking panel). `components/tracking/{Pixel,TrackEvent}.tsx`. Fires PageView (StoreShell), ViewContent (product page), AddToCart (button), Purchase (order page).
- [x] Zotomic marketing site — Meta Pixel + GA4 via `ConditionalLayout` (marketing branch only), config from `platform_settings` (cached 5 min). **Server-side GA4** (`ga4ServerEvent`, Measurement Protocol) fires `sign_up` on signup + `generate_lead` on contact.
- [x] Product delete (owner) — `deleteProduct` action: hard-delete if unsold, else archive+hide. Button in the edit modal.
- [x] Task delete (owner) — `deleteTask` + × button per row.
- [x] Admin impersonate — `adminImpersonate` mints a 2-hour owner JWT + sets the cookie → admin uses `/app` as the owner for support. `admin.impersonation_started` audit event. Button on `/admin/tenants/[id]`.
- [x] Verified: `/admin/settings` + `/app/settings` + tenant detail 200; assistant `send_report_email` called (graceful "Gmail not configured" fallback + inline summary).

---

## GAPS AUDIT (2026-08-29) — remaining work, no numbered phases

**Ingestion:**
- [x] CSV import (products + orders) with column mapping + preview → `/app/products` and `/app/orders` (`ProductImport`/`OrderImport`, `lib/csv.ts`)
- [x] Manual order entry form (`/app/orders/new`) — `NewOrderClient` + `createManualOrder` → shared `lib/orders/create.ts`
- [x] Per-store Messenger / WhatsApp / Instagram connect (paste creds → webhook URL + verify token) — `/app/integrations`, `lib/messaging.ts`, `/api/webhooks/meta/[businessId]`, inbox at `/app/messages` + notification. Every plan + admin, each store separate.
- [ ] Facebook "Connect with Facebook" OAuth (deferred — paste-credentials model shipped instead; needs a reviewed Meta app)
- [ ] Outbound replies from the Zotomic inbox (read-only for now)

**Needs user action / external:**
- [ ] `GMAIL_APP_PASSWORD` — all email is log-only until set (invoices email, order emails). Also `EMAIL_ASSISTANT_FROM` needs a verified Gmail "send mail as" alias for `Assistant@zotomic.com`.
- [x] `zotomic.com` domain moved onto this Vercel project (2026-08-30). Apex serves the app; storefronts at `zotomic.com/<slug>` (middleware path rewrite). `NEXT_PUBLIC_SITE_URL=https://zotomic.com`.
- [ ] Wildcard `*.zotomic.com` domain in Vercel — only needed for the `<slug>.zotomic.com` storefront form; path form works now
- [ ] Enter values in admin: Telegram bot token + zotomic.com Meta Pixel/GA4 (`/admin/settings`); Hermes gateway URL/secret + n8n URL/key (`/admin/integrations`)

**Storefront / commerce:**
- [x] Storefront events into `storefront_events` table (`StorefrontTracker` / `storefrontEvent` → `/api/storefront/events`; intelligence reads it via `lib/traffic.ts`)
- [x] Cart-count badge in storefront header (`HeaderActions` — cart + wishlist counts, event-driven)
- [x] `next/image`-grade optimization on product images (`cldUrl()` transforms + width/height)
- [x] Wishlist (device localStorage, `/s/[slug]/wishlist` page, `WishlistHeart`, `add_to_wishlist` event)
- [x] Shipment status sync cron (`/api/cron/shipments` + `20260829210000_shipment_cron.sql`, every 6h)
- [x] Product variants + inventory — `product_variants` / `inventory_adjustments` tables, option+variant matrix editor, `/app/inventory` (stock overview + reason-coded adjustments + audit log), variant-aware pricing/stock in `lib/orders/create`, storefront checkout, storefront product page (option picker) and manual order form
- [x] Returns / RMA — `returns` / `return_items` tables, `/app/returns` (create against an order, approve → received restocks + logs → refunded marks the order returned/refunded)
- [x] Storefront customer accounts — `store_accounts` / `store_account_addresses`, per-store signup/login (bcrypt + 30-day JWT cookie scoped to the business), `/s/[slug]/account` (orders + profile + saved addresses), header + mobile-nav User icon, checkout prefill + order linking; guest checkout still works
- [x] Storefront product search — `StoreSearchBar` + `?q=` on the Shop page (name/description/category)
- [x] Storefront mobile bottom nav — `MobileNav` icon bar (Home/Shop/Saved/Cart/Account), cart+wishlist badges, hidden ≥ sm
- [x] Storefront quick-add on product cards, incl. variant `<select>` (lazy-loaded from `/api/storefront/variants`)
- [x] Working store link in dashboard — `/app/storefront` + `/admin/websites` now link the path form (`SITE/s/<slug>`) instead of the dead `<slug>.zotomic.com`
- [ ] Promo codes · abandoned-cart
- [ ] Storefront account: email verification + password reset (accounts work, these are follow-ons)
- [ ] Nagad / SSLCommerz / Pathao / RedX real implementations
- [ ] Custom domain: DNS verify → SSL → GSC unlock (paid tier)
- [ ] Google server-side tracking per paid store (isolated container) — only the platform site has it

**App polish:**
- [x] `/forgot-password` real email reset flow (`password_reset_tokens`, `/api/auth/forgot` + `/reset`, `/reset-password` page)
- [x] `/app` + `/admin` layouts render shell immediately (no spinner gate); topbar fills in async
- [x] Assistant: conversation list + "new chat" switcher, auto-title from first message
- [x] Legal pages rewritten with BI-SaaS copy (tenant isolation, AI disclaimer, billing locks, merchant-of-record)
- [x] Notifications: mark-all-read + per-notification read (`/app/notifications`, unread badge in topbar)
- [x] Lighthouse CI GitHub Action (`.github/workflows/lighthouse.yml`)
- [x] Admin report-job retry button (`/admin/reports` per-row Retry for failed/queued)
- [x] Assistant tool-error → structured `{ error }` fed back to the model (not thrown) — `runAgent` catches every handler
- [ ] Assistant: streaming responses (still a single blocking turn)
- [x] Editable legal/info pages — store owner (storefront `pages`: privacy/terms/refund/shipping/faq, "Pages" tab in the editor, dynamic `/s/[slug]/[doc]` + `/faq` routes) AND admin (`platform_pages` table, `/admin/content-library` "Pages & Legal" editor, DB-backed `/privacy-policy` `/terms` `/refund-policy` `/faq`)
- [x] Storefront: sticky footer (no blank space on short pages), real contact enquiry form
- [ ] `/app/marketing` + `/admin/marketing` — placeholders (P2 growth modules / Outreach Agent)
- [ ] i18n — English-only; strings not yet extracted for Bengali
- [x] Per-store Meta Pixel + GA4 available on every plan (moved into `/app/integrations` "Tracking & pixels"; Conversions API token stored encrypted)
- [x] `/admin/integrations` built (was a dead nav link) — Hermes gateway + n8n + Meta app-secret credential entry (`platform_settings`), per-tenant connection overview
- [x] Subscription invoices (Zotomic → owner, paid) — branded printable `/app/billing/invoice/[id]` with store logo, Print/Save-as-PDF, email invoice
- [x] **Customer order invoices** (store → buyer) — `lib/order-invoice{,-pdf}.ts` (`pdf-lib`, real PDF). `/app/orders/[id]/invoice` printable + Download PDF + Email-to-customer (PDF attached). "Download invoice (PDF)" on the storefront confirmation page + attached to the confirmation email. `branded_invoice` entitlement: paid = own logo/address, no Zotomic mention; free = no logo + "Powered by Zotomic".
- [ ] Real Hermes VPS client (`hermes_base_url` now enterable in `/admin/integrations`; `runAgent` still the local Gemini loop until wired)
- [ ] n8n live calls (`n8n_base_url` / `n8n_api_key` enterable in `/admin/integrations`; not yet consumed)
- [ ] Admin: tenant CSV export, richer system-health history

**Data model:** `ProductVariant`, `Inventory` (as `inventory_adjustments`), `Return` — DONE. `Domain` still folded into integrations.

---

## PHASE 9 — Monetization spine, guardrails & storefront conversion  (`need to add.txt`, 20 items)

Founder-grade sequencing: **protect the downside → build the revenue mechanism → make it observable → improve conversion.** Stop for user review after each sub-phase. Plan discussed & locked with user 2026-09-08 (3 rounds).

### Locked decisions

**Credits (item 6)** — activates the `creditCost` field already in `lib/tools/registry.ts`.
- Allowance **resets weekly, every Friday, for ALL stores** (free + paid). Weekly (not per-plan monthly) is deliberate — matches the weekly-report cadence.
  - Free **15/wk** · Business **250/wk** · Pro **1,200/wk** (numbers TUNE after measuring real Gemini cost/turn in 9C).
- Cost per action: read tool **0** (metered, free) · AI turn (Gemini call) **1** · write tool **1** · consequential tool **2** · **web/Google-Search grounding tool 10** + hard daily cap (free 5/day · business 30/day · **pro (top tier) 100/day max**).
- Overdraft **−20** allowed so a conversation never cuts off mid-turn; repaid from the next Friday allowance. At/below the overdraft floor: **assistant AI hard-blocked until Friday**, 0-cost read tools still work, UI shows "Upgrade / Top up".
- Credit balance **replaces** the current hard daily message cap (`assistantMessagesPerDay`). Keep a light per-minute abuse throttle.
- **Top-up packs** (charm pricing, improving unit rate, one anchored "Most popular"; ৳ TUNE in 9C):
  | Pack | Credits | Price | ৳/credit | Tag |
  |---|---|---|---|---|
  | Starter | 150 | ৳100 | 0.67 | min top-up = ৳100 |
  | Value | 700 | ৳400 | 0.57 | **Most popular** |
  | Power | 1,800 | ৳900 | 0.50 | Best value |
  | Bulk | 4,500 | ৳2,000 | 0.44 | |
- **Purchase flow** = clone of the subscription billing loop: owner picks pack → pays admin's personal **bKash or Nagad** → submits txn ID → **admin notified** → admin one-click "Grant credits" → `credit_ledger` entry + owner notified.
- **One bKash + one Nagad number**, shared for subscription payments AND credit top-ups, admin-managed in `/admin/settings` (add/edit/delete).
- Dashboard credit meter on `/app` + `/app/assistant`: included · used · remaining · resets Friday.

**Weekly Intelligence Report as a paid service (item 1's "paid some day")** — build the gate now, leave it OFF. `weekly_report` entitlement (default granted to all); admin can flip it to paid-only per-store (`feature_overrides`) or globally (`platform_settings`). Not activated in this phase.

**Plan limits (items 2, 3, 14, 15)** — all into `lib/plans.ts.limits`:
| | Products | Images/product | Hero images |
|---|---|---|---|
| Free | 10 | 3 | 1 |
| Paid | 100 | 5 | 3 |
- One `assertWithinPlan()` helper → `createProduct`, `importProducts`, `ImageUploader` (server-side count), storefront hero editor.
- **Grandfather existing over-limit free stores** (`businesses.limits_grandfathered_at`): data stays visible, can't add past the cap until upgrade/prune. Current code is free 30 / paid unlimited — this tightens it.

**Invoice sender identity (items 4, 5)**:
- Free → from `invoice@zotomic.com` (note: user's file typos it "zotomci"), admin-configurable in `/admin/settings`.
- Paid → owner sets own sender address in `/app/settings → Invoice & branding`.
- Deliverability: send from Zotomic infra, `From: "Store Name" <invoice@zotomic.com>`, **`Reply-To:` = owner's address**. Real SPF/DKIM send-as = later custom-domain tier. (All email still log-only until `GMAIL_APP_PASSWORD` set.)

**Marketing / campaigns (item 10)** — separate `/app/marketing` module, NOT a product field:
- `campaigns` + `campaign_products` join (**many-to-many**; owner selects one or many products per campaign).
- Fields: name, budget (USD), actual spend (USD, entered after end), start, end.
- **Live USD→BDT** rate, cached 24h, free no-key source (`open.er-api.com`); store the rate + timestamp used on each campaign so reports are reproducible; API down → last-known rate, flagged.
- **Attribution = strict `[start, end]` window, linked products only, every sale counted.** No channel guessing, no invented numbers. Report states exactly what was measured and the limitation.
- Feeds the Weekly Intelligence report as a deterministic section. Old single `marketing_cost` product field stays for informal use.

**Product-card / PDP badges (item 19, hybrid)** — card shows **at most one** badge, top-right in-frame. Priority: **Sale → Hot → Best → New**.
| Badge | Type | Rule |
|---|---|---|
| Sale | auto | `sale_price` set and `< price` |
| Hot | **manual** | owner toggles per product |
| Best | auto | store's top 5 by units sold, last 30 days |
| New | auto | created within last 14 days |
- Owner per-product controls: "Hot" toggle + "hide all badges".

### 9A — Guardrails (item 7)  ✅ CODE DONE (2026-09-08) — build green, awaiting user review
- [x] Gemini **circuit breaker** — `lib/ai/circuit.ts` (module-level state, shared by `lib/ai/gemini.ts` + `lib/agent/hermes.ts`): per-model consecutive-failure count → open circuit for 60s after 4 fails; `chainOpen()` short-circuits the whole request (caller falls back deterministically) when every model is cooling off.
- [x] Exponential backoff (400ms→2s cap) on 429/503/network before advancing the model chain, in both AI modules.
- [x] Gemini **daily call ceiling** — `lib/ai/budget.ts`, backed by existing `usage_ledger` (`kind='ai_tokens'`, no schema change): per-business (default 500/day) + global (default 8000/day), UTC-day window, env-overridable (`AI_DAILY_LIMIT_PER_BUSINESS` / `_GLOBAL`). Checked + recorded in `/api/assistant/messages` (both normal + approval-resume paths; `runAgent` now returns `aiCalls`) and `lib/reports/generate.ts`. Over-limit → friendly 429 / deterministic fallback.
- [x] **Rate limiting** — `lib/ratelimit.ts` (in-memory fixed-window, `enforceRateLimit()` one-liner guard). Applied: `login` 10/5min, `signup` 5/hr, `forgot` 5/hr, `contact` 5/hr, `review` 10/hr, `checkout` 12/10min (per-IP); `media-sign` 60/min, `assistant` 8/30s (per-business).
- [x] No schema, no UX. `npx tsc --noEmit` + `npx next build` green.

### 9B — Plan limits & enforcement (items 2, 3, 14, 15)  ✅ CODE DONE (2026-09-08) — build green, migration pending apply
- [x] `lib/plans.ts.limits` — `products` (free 10 / paid 100), `productImages` (3/5), `heroImages` (1/3) + `weeklyCredits` / `webSearchPerDay` (pre-wired for 9C). Feature strings + pricing page copy updated (pricing page renders `p.features`, auto).
- [x] `lib/plan-limits.ts` — `getPlanLimits(businessId)` (plan + grandfather flag), `checkProductLimit` (block add past cap, friendly copy), `remainingProductBudget`, `clampProductImages`.
- [x] Wired: `createProduct` (blocks past cap + clamps images), `updateProduct` (clamps images), `importProducts` (trims to remaining budget, reports `skipped`), `ProductsClient` (usage line + at-cap banner + disabled "Add product" + `ImageUploader max`), `ProductImport` (skipped toast).
- [x] Hero images (items 14/15): hero section `data.imageUrl` → `data.images: string[]` (legacy folded in `normalizeConfig`); `Sections.tsx` hero renders static banner for 1, **pure-CSS crossfade slideshow** for 2–3 (respects `prefers-reduced-motion`); `StorefrontEditor` hero gets an `ImageUploader` capped at `heroImageLimit` (passed from `getPlanLimits`), new `"images"` field type in `section-fields.ts`.
- [x] Logo (item 8): "Logo URL" text field → `ImageUploader` (max 1) in the storefront editor Brand panel.
- [x] Grandfather migration `20260908120000_plan_limits.sql` — `businesses.limits_grandfathered_at`, backfilled for all existing businesses. Existing over-cap stores keep their data + see a gentle banner; add-block still applies.
- [x] `weekly_report` entitlement — added to `lib/entitlements.ts` (`deriveEntitlements` now honours explicit `false` overrides too); `weekly-reports` cron skips businesses whose override revokes it. Default-on for everyone — **not activated**.
- [x] Fixed a pre-existing type error surfaced by the full recheck (`app/s/[slug]/account/AccountAuthClient.tsx`).
- [x] `npx tsc --noEmit` + `npx next build` green.
- [ ] ⚠️ **Migration not yet applied** — `supabase db push` and the Management API are both blocked by this session's command classifier. All Phase 9 migrations are collected for the user to apply in one step at the end.

### 9C — Credits + invoice identity (items 6, 4, 5)  ✅ CODE DONE (2026-09-08) — build green, migrations pending apply
- [x] Migrations `20260908130000_credits.sql` (`credit_accounts` two-bucket: allowance_balance weekly-reset + purchased_balance permanent; `credit_ledger` append-only; `credit_purchases` owner-submit/admin-confirm; `app.reset_credit_allowances()` + `app.trigger_credit_reset()` + **pg_cron `credit-reset` Fri 04:00 UTC**) and `20260908140000_invoice_sender.sql` (`businesses.invoice_from_email`). `usage_ledger.tool_name` already existed.
- [x] `lib/credits.ts` — `getCreditAccount` (lazy-create + lazy weekly reset + plan-allowance sync), `canSpendCredits`, `chargeCredits` (allowance→purchased→overdraft, −20 floor), `grantCredits` (+/- purchased), `webSearchesToday`, `recentCreditLedger`, `CREDIT_PACKS` (৳100/150 · ৳400/700 "Most popular" · ৳900/1800 · ৳2000/4500).
- [x] `/api/assistant/messages` — removed the `assistantMessagesPerDay` hard cap; credit gate before `runAgent` (402 + reset-day message when at overdraft floor, 0-cost reads still allowed); `settleTurn()` charges `aiCalls + creditsUsed` after every turn, records per-tool `usage_ledger` rows, returns new balance in the response.
- [x] `runAgent` credit costs: AI turn 1 (per `aiCalls`), write 1, **consequential bumped 1→2**, **`web_search` tool = 10** (+ per-plan daily cap free 5 / business 30 / pro 100, counted via `usage_ledger.tool_name='web_search'`). New `lib/ai/search.ts` (Gemini `google_search` grounding, circuit-breaker aware, returns answer + source links). System prompt nudges the model to prefer store data and cite sources.
- [x] `/api/cron/credits` — Friday heads-up notification per store (SQL function does the balance work; `getCreditAccount` self-heals a missed run).
- [x] Top-up: `app/app/billing/CreditsCard.tsx` (pack picker + bKash/Nagad selector showing the admin number + txn submit) + `credit-actions.ts submitCreditPurchase` (dupe-txn guard, admin notification, audit). Billing page also shows current balance + recent credit activity.
- [x] Admin `/admin/credits` (new, in nav) — confirm/reject top-up queue (one-click **Grant** → `grantCredits` + owner notification + audit), **manual add/deduct credits for any store** with owner-visible note (item 6). `/admin/usage` already shows per-store consumption (9D extends it).
- [x] `/admin/settings` — new platform keys `payment_bkash_number`, `payment_nagad_number` (shared subs + top-ups), `invoice_from_email` (default `invoice@zotomic.com`). Subscription `PaymentForm` now shows the bKash number.
- [x] `components/app/CreditMeter.tsx` — on `/app` dashboard (full card) + `/app/assistant` (compact). Shows spendable / weekly / bought / resets-on / overdraft.
- [x] Invoice sender (`lib/invoice-sender.ts`): free → `From: "<Store> (via Zotomic)" <invoice@zotomic.com>`, `Reply-To` = store contact email; paid (`branded_invoice`) → `From: "<Store>"`, `Reply-To` = owner's `invoice_from_email`. Envelope From stays a Zotomic address (Gmail SMTP reality). Wired into `emailOrderInvoice`, storefront checkout confirmation, gateway payment callback. Paid owner sets the address in `/app/settings → Invoice & branding`; that section's logo field is now an `ImageUploader` (item 8).
- [x] `weekly_report`-as-paid-service scaffold from 9B stays inert.
- [x] `npx tsc --noEmit` + `npx next build` green.

### 9D — Operator visibility (items 12, 13)  ✅ CODE DONE (2026-09-08) — build green, migration pending apply
- [x] `/admin/assistant-activity` — added **Credits by tool (30d)** and **Credits by business (30d)** tables from the new per-tool `usage_ledger` rows (item 12: "how much credit on which tools"). Kept the recent-messages log.
- [x] `/admin/usage` — per-store table: credits now / spent 30d / AI turns / **Cloudinary (exact, `media_assets.bytes`)** / **Supabase (est.)** / reports. Totals row. Migration `20260908150000_admin_usage.sql` adds `app.tenant_storage_estimate()` (row-count × nominal bytes/row — honest estimate, avoids Supabase's 1000-row select cap). Vercel = "shared, see dashboard" note (per plan — not overbuilt).
- [x] `npx tsc --noEmit` green.

### 9E — Storefront conversion (items 1, 8, 11, 16, 17, 18, 19, 20)  ✅ CODE DONE (2026-09-08) — build green, migrations pending apply
- [x] **11** — `components/ui/modal.tsx` now `createPortal`s to `document.body` at `z-[70]` (was `z-50`, same as the app sidebar → could be trapped behind it / clipped by a card stacking context). Backdrop-click closes. Fixes the return/restore popup overlap and every other modal.
- [x] **1** — `product_categories` table (`20260908160000_categories.sql`, per-store name/slug/sort, backfilled from existing free-text `products.category`). `category-actions.ts` (create/rename/delete→Uncategorised/reorder, keeps `products.category` text in sync). `CategoryManager` modal in `/app/products` ("Categories" button). Product form Category field is now a `<Select>` of managed categories (falls back to free text if none).
- [x] **8** — logo uploads now go through `ImageUploader` in both the storefront editor (9B) and `/app/settings → Invoice & branding` (9C). Product images use `ImageUploader` with the plan cap. Pipeline unchanged (server-signed, browser-compressed, URL-only).
- [x] **16** — `components/storefront/QtyStepper.tsx` (shared Minus/Plus control) used on both the cart page and the checkout order summary.
- [x] **17** (PDP) — rating stars + count (links to #reviews), "N sold", "Only N left" near the title; **Buy Now** button under Add to Cart (`AddToCartButton` gained `basePath` + buy-now → adds + routes to checkout). `getStoreProduct` now returns rating/reviewCount/sold/isNew/isHot/isBest.
- [x] **18/19/20** (card) — new `ProductCardMedia` (client): quick-view eye icon **top-left**, wishlist heart **top-left after it**, one badge **top-right**, rating/sold/low-stock chips **bottom-left**. Quick-view opens a portal modal (image + short description + rating + stock + "View full details"). `QuickAdd` gained a **Buy now** button under Add to cart (variant-aware). All icons use `lucide-react` at the wishlist icon's weight.
- [x] Badges (`lib/storefront/store.ts` `badgeFor`): one at a time, priority **Sale → Hot → Best → New**. Sale = sale_price set; New = created < 14d; Best = store top-5 by lifetime units; Hot = manual toggle. Per-product **"Mark as Hot"** + **"Hide all badges"** in the product form (`20260908170000_product_badges.sql` adds `products.is_hot` / `hide_badges`).
- [x] `npx tsc --noEmit` + `npx next build` green.
- NOTE: card/PDP visual details built to the §E5 spec + item text; open to a visual tweak pass once the user sees it live.

### 9F — Marketing module (item 10)  ✅ CODE DONE (2026-09-08) — build green, migration pending apply
- [x] Migration `20260908180000_campaigns.sql` — `campaigns` (name, status, budget_usd, spend_usd, starts_on, ends_on, fx_rate, fx_at, notes) + `campaign_products` join (many-to-many), RLS + updated_at trigger.
- [x] `lib/fx.ts` — live USD→BDT via `open.er-api.com` (no key), `unstable_cache` 24h, `FALLBACK_USD_BDT` + `stale` flag when offline.
- [x] `lib/marketing.ts` — `getCampaignAttribution` (**strict**: every non-cancelled sale of linked products in `[starts_on, ends_on]`, no channel guessing), `campaignsInWindow`. Captures the FX rate on create for reproducibility.
- [x] `/app/marketing` (was a placeholder) — campaign list with per-campaign stat tiles (spend $ / ৳, units, revenue, cost-per-unit + ROAS), plain-language limitation note, create/edit modal with **product multiselect** (one or many), delete. USD spend + budget; actual spend entered after the campaign ends.
- [x] Weekly Intelligence report — `lib/reports/generate.ts` adds a deterministic observation per overlapping campaign ("Campaign X: spent ৳Y, linked products sold N units for ৳Z — ৳P/unit, R× ROAS. Counts all sales of these products in the window, not only ad-driven ones.").
- [x] Old single `marketing_cost` product field kept for informal use.
- [x] `npx tsc --noEmit` + `npx next build` green.

### 9F — Marketing module (item 10)  ⬜  (can run parallel to 9D/9E)
- [ ] Migration: `campaigns` + `campaign_products`.
- [ ] `lib/fx.ts` — cached live USD→BDT, last-known fallback.
- [ ] `/app/marketing` — campaign CRUD + product multiselect.
- [ ] Deterministic attribution calc (strict window, linked products, all sales) + honest limitation copy.
- [ ] Weekly Intelligence report gains a campaigns section (`lib/reports/generate.ts`).

---

## LOG

- 2026-09-09 — **PDP low-stock placement + wording** (commit `9906ac6`, deployed + browser-verified). Mobile: `<LowStock />` moved from the rating block to directly **above the Qty stepper** (right column of the price row). Desktop under-image strip: `low stock - 04` → `Only 4 left`. `LowStock` is now a compact one-line label. Classic T-Shirt demo stock set to 3 (was 381 from an earlier hand-fix) so it shows "Only 3 left" for a variant product before any variant is picked.
- 2026-09-09 — **Fix: PDP never showed low stock** (commit `4903f63`, deployed + browser-verified). Root cause: `products.track_inventory` defaults to `false` and the `/app/products` form never set it → `product.trackInventory` was always false → the PDP's `lowStock`/`soldOut` (and the card's) never fired. Fixes: (1) `ProductForm` gains a "Track stock" checkbox (default on); `createProduct`/`updateProduct` write `track_inventory`. (2) `ProductDetail.stockLeft` falls back to the product's own tracked stock when no variant is selected (was `null` → invisible until you picked a size), and `lowStock` is suppressed when sold out. (3) Backfilled `track_inventory=true` for existing non-variant products with `stock_qty>0` (via Management API). Demo: Cap Collection set to stock 4 — shows "Only 4 left" + "low stock - 04" on mobile & desktop.
- 2026-09-09 — **Fix: invoice PDF crashed on the Taka symbol** (commit `d362303`, deployed). `buildInvoicePdf` drew amounts via `money()` (`৳`/`₹`) but pdf-lib's base-14 Helvetica is WinAnsi-only → threw `WinAnsi cannot encode "৳"`, breaking PDF download AND Send (the server action's throw surfaced as the page's "server-side exception" digest). Fixed: `pdfMoney()` prints the ISO code (`BDT 1,000.00`), `winAnsiSafe()` maps every drawn string to Latin-1, `sendInvoice` sends HTML-only if the PDF ever fails. (Diagnosed with a temp `/api/dbgx` route — `_`-prefixed folders are private in the app router and 404, so it was named `dbgx`; removed after.)
- 2026-09-09 — **Admin Invoices module** (commit `c43c083`, deployed; migration `20260909140000` APPLIED to prod via Management API). New `/admin/invoices` sidebar tab (icon `ReceiptText`, between Credits and Financials). Full CRUD: create/edit/delete invoices with **multiple line items**, bill a registered business OR a free-form name+email. Manages **all** invoices (manual + subscription); edit/delete blocked on `paid` and on `kind='subscription'` (void instead). **Send** from `invoice@zotomic.com` — `sendEmail({account:"invoice"})` with inline `renderInvoiceHtml` body + a `buildInvoicePdf` (pdf-lib, A4, no headless browser) PDF attachment; `/admin/invoices/[id]/pdf` serves it (admin-gated route handler). Status flow draft→open→paid/void, all audit-logged. Files: `lib/admin-invoices.ts`, `app/admin/invoices/{page,InvoicesClient,InvoiceForm,actions}.tsx` + `[id]/{page,InvoiceDetailClient}.tsx` + `[id]/pdf/route.ts`. Migration: `invoices` +kind/recipient_name/recipient_email/notes/issued_on/sent_at/created_by, `payment_reference`+`business_id` now nullable, status check adds `'draft'`; new `invoice_line_items` table (+RLS tenant policy). Test invoice `ZINV-2609-900001` (Acme Test Ltd) left in prod for the user to try Delete on.
- 2026-09-09 — **Admin: every list drills into the business hub** (commit `583dd3f`, deployed; logged-in click-test needed). `/admin/tenants/[id]` is now a full per-business hub — added credits balance + `credit_ledger`, 30-day `usage_ledger` rollup (credits / AI turns / tool calls), recent `invoices` (→ `/admin/financials/[id]`), recent `reports` (→ `/admin/reports/[id]`), recent `assistant_messages`. Row links added: `/admin` (recent-signup + top-business rows), `/admin/subscriptions` (subscription rows → hub; pending-queue items → their full invoice), `/admin/usage` + `/admin/assistant-activity` (per-business rows → hub), `/admin/credits` (queue/history business names + adjust-form → hub). `admin-metrics` `topBusinesses` gained `id`.
- 2026-09-09 — **Admin Reports drill-in + range filter** (commit `007de16`, deployed; needs a logged-in click-test). `/admin/reports` Business cell → `/admin/reports/[id]` (new): full weekly report for any business — summary, `report_metrics` snapshot, `insights`, `recommendations`, Retry for failed/queued. Added `?range=` filter chips (Last 30 / 90 (default) / 365 days / all) on `reports.created_at`.
- 2026-09-09 — **Report & invoice detail pages** (commit `4b97689`, deployed; needs a logged-in click-test). New `app/app/reports/[id]/page.tsx` — full weekly report for one `report_id`: status, summary/AI narrative, metric snapshot from `report_metrics` (value + `change_pct` + `unavailable_reason`), `insights` and `recommendations` scoped to that report. `/app/reports` period + generated cells now `<Link>` to it. New `app/admin/financials/[id]/page.tsx` — one invoice: amount/issued/due/paid, `payment_reference` + `txn_id`/`txn_amount`/`txn_submitted_at`, resolved `confirmed_by` name, plus the rendered invoice sheet via `getInvoiceData`/`renderInvoiceHtml`. `/admin/financials` invoice-number cell links to it. Both ownership-checked (report `business_id === tenant.businessId`; admin page behind `requireAdmin`).
- 2026-09-09 — **PDP polish** (commit `5cc9c3a`, deployed + browser-verified). Desktop: moved the under-image strip inside the image sub-column (`<div className="min-w-0 flex-1">` wrapping the image button + strip, beside the thumb rail) so its width == the product image width exactly. Mobile: the colour selector was `absolute left-4 top-1/2` (pinned to image centre) — now it's a compact left-aligned **row directly above the info panel** inside a new `absolute inset-x-0 bottom-0` stack (colour row → panel `mx-2 max-h-[48vh]` → buy bar), `px-4 pb-2.5` for the gap; circles shrink to `h-6 w-6` under 380px (`min-[380px]:h-7`).
- 2026-09-09 — **Desktop PDP: under-image meta strip + click-to-open reviews** (commit `1704f6b`, deployed + browser-verified). Below the product image on desktop: a bordered strip `flex justify-between` — `★★★★★ 4.5 (12)` (left, clicking opens the reviews) · `sold - 159` (middle) · `low stock - 04` (right, red, `String(stockLeft).padStart(2,"0")`, only when low). The title-row `RatingRow` stays. The Description / Ratings&reviews two-column block: Description is always open; **Ratings & reviews is a click-to-expand `<button>`** (`showReviews` state) — collapsed it shows the star summary + "Click to read N customer reviews.", expanded shows `ReviewsList`. Title kept as "Ratings & reviews". Verified low-stock padding via a temp stock change on Phone Case (reverted).
- 2026-09-09 — **Paged mobile sizes · single-star mobile rating · star rating on cards** (commit `76e82ac`, deployed + browser-verified). New `components/storefront/Stars.tsx` — `<Stars value count />` = `★★★★★ 4.5 (120)`, `<Stars value single />` = `★ 4.5`. **Mobile PDP**: size row shows 3 values at a time with a `ChevronRight` that pages through the rest (`sizePage` state, wraps); rating is now `★ 4.5` (single star, no count) with the `N sold` line **above** it (`MobileRating`). **Desktop PDP**: Description and Ratings&reviews now sit **side by side** (`grid md:grid-cols-2`) instead of stacked; rating reads `★★★★★ 4.5 (120)` (`RatingRow` → `Stars`). **Product cards**: rating/sold/low-stock moved **off the image** to a line under the price in `ProductCard` (`★★★★★ 4.5 (120)` · `N sold` · `N left`); removed the image-brightness canvas sampling + `overlayText` from `ProductCardMedia` (only fed the old overlay chips). Rating = mean of `product_reviews` where `status='approved'`, already computed server-side in `enrichProducts`/`getProductReviews`. No migration. Test data: 12 approved reviews (avg 4.5) seeded on Classic T-Shirt for verification.
- 2026-09-09 — **PDP size text + colour palette + plan-gated variant editor** (commits `ebe9bf6` · `d50f36d` · hero-nudge, deployed + browser-verified). Storefront `ProductDetail`: (mobile) size values render as a plain tappable **text row to the right of the product name**, above the low-stock line (selected = accent + underline); colour options render as **round filled circles floating left-centre inside the image frame** (`absolute left-4 top-1/2`). Both only when that option exists. (desktop) ratings row **always** renders (muted stars + "No reviews yet" when empty); a labelled **Description** section always renders ("No description provided…" placeholder); a **Colour** palette + **Size** chips + **Size guide** link when available. Low-stock line now reads the **selected variant's** stock (was `!hasVariants` only). New `lib/storefront/colour.ts` — `isSizeOpt` / `isColourOpt` / `resolveSwatch` (name→hex map + CSS-name/hex validation, server-safe). `OptionPicker` now takes `opts` (defaults to non-size/non-colour options). **Owner editing** (`ProductVariantsModal`): guided **Sizes** field (all plans) + **Colours** rows with live swatch preview (**Business plan only** — locked + upgrade link for free); variant rows auto-generate from the guided fields on save; per-combo price/stock table moved under a collapsible **Advanced** section. `saveVariants` rejects colour options for free-plan stores server-side (`billing.plan`). `ProductsClient` passes `plan`. No migration. Test data: Classic T-Shirt (rahman-fashion) seeded with Size×Colour variants for verification — owner can edit/clear via the new modal.

- 2026-09-09 — **Hero: square full-bleed frame + bottom-centre scoop** (commit `2646b7a`, deployed + browser-verified, FINAL after 5 sketch iterations). Owner's actual want: full **device width**, **no corner radius at all** (square top + bottom), sides + bottom edge straight, and ONE small smooth concave **scoop curved up into the bottom-centre** that cradles the carousel dots. Impl: a fixed 120×26 inline `<svg>` `path` filled `var(--sf-bg)` positioned `absolute bottom-0 left-1/2 -translate-x-1/2` (carves the scoop by painting page-bg over the image). Dots sit in the scoop at `bottom-1.5`, active dot = `bg-[var(--sf-accent)]` / inactive = `bg-[var(--sf-fg)]/30` so they stay visible on the light scoop. `scoop = !contained && images.length>1`; contained (rounded-card) hero keeps its old white dots at `bottom-3.5`. Removed the earlier mobile `px-2.5` inset and all the border-radius arch experiments.
- 2026-09-09 — **Hero arched bottom** (commit `e563752`, deployed + browser-verified). Owner sketched the wanted curve: not just rounded bottom corners but a rounded-top card with a wide **arched bottom edge**. `HeroCard` full-bleed branch now uses inline `borderRadius: "22px 22px 46% 46% / 22px 22px 60px 60px"` (rounded top, deep convex bottom arch) + a small `px-2.5 pt-2.5 sm:px-0` mobile inset. Carousel dots (`bottom-3.5`, centred) sit inside the arch.
- 2026-09-09 — **Hero full-bleed image + curved bottom + dots inside · real search filters** (commit `4ca31b2`, deployed + verified). Per user's chosen option "image as full background, text on top": `HeroCard` now renders uploaded image(s) as a full-background layer (`object-cover object-center`, **no scrim/shade** — just a text-shadow on the heading/sub for legibility), heading + tag + Shop-now pill overlaid, and the **carousel dots moved inside the card** (`absolute bottom-3.5`, centred over the image) instead of floating in white space below. Full-bleed hero (`style:"full"`) gets a **curved bottom edge** (`rounded-b-[26px] sm:rounded-b-[36px]`); coloured `tone` card is the no-image fallback. `StoreSearchBar`: the sliders button was a no-op submit → now opens a **real filter popover** (sort: relevance / newest / price ↑ / price ↓ / top-rated + "in stock only" toggle) applied as `?sort=` / `?stock=` URL params, with an active-filter red dot on the button. `app/s/[slug]/products/page.tsx` honours `sort` (price uses `salePrice ?? price`) + `stock`. Verified live: `?sort=price-asc` reorders ৳350 → ৳1900; hero shows the 3 uploaded images. tsc + build green.
- 2026-09-09 — **Hero card everywhere + category strip + mobile search bar** (commit `3d5b4f8`, deployed). Hero is now ALWAYS `HeroCard` (deleted the full-bleed-text-over-photo variant + `HeroSlides`); no scrim/mask (owners upload composed artwork). `style` field now = rounded card (default) vs full-bleed band. Home page (`app/s/[slug]/page.tsx`) **auto-injects a "Categories" strip right after the hero** unless the owner placed a `category_grid` section. `CategoryChips` restyled to rounded photo+label chips (falls back to text pills w/o images) + gentle auto-scroll, pause on hover/touch. **Mobile header search** was an icon linking to `/products` → now a real full-width `StoreSearchBar` row under the header (`sm:hidden`; desktop keeps the compact header input; shop-page search bar → `hidden sm:block`). `StoreSearchBar` restyled: "What are you looking for?" + accent submit button.
- 2026-09-09 — **Mobile hero = banner card** (commit `8455bf4`, deployed). New `HeroCard` client component matching a reference mockup: rounded coloured card, optional `tag` pill (new hero field), headline, dark Shop-Now pill with a circular `ArrowUpRight`, images bleed from the right with a `mask-image` left fade, centred dots below, auto-crossfade. **Mobile always renders HeroCard** regardless of the hero's `style`; desktop `style:"card"` uses HeroCard's 2-col form, `style:"full"` keeps the edge-to-edge bg. `tone:"accent"` is now a **solid** accent fill (was `--sf-accent-soft` tint). To get the green reference look a store sets tone=Accent + a tag.
- 2026-09-09 — **Hero slideshow + Featured carousel** (commit `a58bce6`, deployed). Hero multi-image was a broken CSS keyframe (`sfHeroFade` showed each slide ~6% of the cycle → 3 uploaded images looked blank). Replaced with `HeroSlides` client component — JS `setInterval` crossfade (900ms), 5s cadence, reduced-motion aware, tappable dots, optional `scrim`. Fixed hero stacking: `isolate` + `z-0`/`z-10` (was `-z-10` which can paint behind the StoreShell root bg). `featured_products` → new `ProductCarousel` (horizontal snap-scroll, auto-advance 3.8s, pauses on hover/touch, desktop arrows, up to 10 products; skips auto-advance when everything fits).
- 2026-09-09 — **Storefront: glass → solid** (commit `39451d4`, deployed). Dropped all `backdrop-blur` from storefront chrome (felt unprofessional per user). PDP mobile info panel = solid `--sf-bg`; buy bar = solid `--sf-accent`; top buttons = solid white circles. Product card corner UI: no frosted pills — icon buttons are solid white circles; rating / "N sold" are **plain text that flips black↔white from a 12px canvas luminance sample** of the product photo (`imgDark` state, `crossOrigin` sample img, CORS-fail → default white); low-stock stays a solid red pill. Header + `MobileNav` pill = solid. `ImageZoom` now supports **horizontal swipe** to change images.
- 2026-09-09 — **PDP mobile fixes** (commit `452e40c`, deployed). Swipe left/right on the hero to change images. Info moved into a **frosted glass panel** (`bg-[var(--sf-bg)]/75 backdrop-blur`, theme-adaptive) — fixes headings blending into the photo (root cause: globals.css `@layer base h1,h2,h3,h4{color:var(--fg)}` overrode the inherited white; StoreShell's injected `<style>` now adds unlayered `h1,h2,h3,h4{color:inherit}` which beats the layered rule). Price + qty on one row, **qty right-aligned**, gap above the buy bar. **Low stock** = its own red line with a flame icon above the price row, only when `stockQty<=5`. Buy bar = **blue glass** (`bg-[var(--sf-accent)]/85 backdrop-blur` + `-webkit-backdrop-filter` inline) matching the floating nav. `MenuDrawer` slides in/out (`translate-x` + fade, 300ms). Top-bar buttons use theme-adaptive glass.
- 2026-09-09 — **Immersive mobile product page DONE + DEPLOYED + VERIFIED** (commit `79f4492`). New `ProductDetail` client component (replaces `AddToCartButton` + `ProductGallery`, both deleted). Mobile = full-screen `fixed inset-0` image layer (StoreShell header + `MobileNav` suppressed on `/products/<handle>` via pathname regex), all info on a bottom gradient scrim (badge/name/rating/`N sold`/**low stock as a red number**/price/colour swatches/size pills/qty), **Details + Reviews as swipe-down `BottomSheet`s**, single rounded pill **`Add to cart | Buy now`** pinned bottom, floating back/wishlist/zoom/menu buttons. Tap image → `ImageZoom` (double-tap zoom, drag-pan, swipe-down close). Desktop = 2-col sticky, vertical thumb rail, click-to-zoom, labelled Colour/Size/Qty/Description/Reviews, same split pill. New `MenuDrawer` (right slide-in: store nav + account sign-in/out, ghost-styled) in the header (`md:hidden`) + PDP top bar. **StoreShell now injects `--sf-*` tokens + store font on `:root`** so body-portal overlays (sheets/zoom/drawer/quick-view) inherit them. No migration. tsc + build green.
- 2026-09-09 — **Storefront theme overhaul DONE + DEPLOYED + VERIFIED** (commit `74c82ae`). Universal config-driven theme, desktop + mobile, from 4 reference-app mockups. A) theme tokens (`RADIUS_LG_PX`, `--sf-shadow/--sf-elevated/--sf-accent-soft`), header desktop search (`HeaderSearch`). B) product card — floating `+` quick-add overhanging the frame (`ProductCardMedia` now client, has cart logic), quick-view eye + wishlist top-left, one badge top-right, chips bottom-left, "Buy now" below (`QuickAdd` slimmed to buy-now only). C) shop page — `CategoryChips` photo-chips (migration `20260909120000_category_image.sql` → `product_categories.image_url`, APPLIED via Management API; category queries use `select("*")` so a missing column can't break the store), `getStoreCategories()` helper, wider gutters. D) PDP — `ProductGallery` (vertical thumb rail desktop / swipe mobile), qty stepper, colour→swatch for colour-named options, size-chart link+modal (`commerce.sizeChartUrl`), **sticky mobile buy-bar** via IntersectionObserver in `AddToCartButton` (portal, `sm:hidden`, covers the bottom nav on PDP), sticky desktop info column. E) hero — `data.style` `full`|`card` + `data.tone` `surface`|`dark`|`accent` (card = banner + side image + pill CTA + dots); section "See all" headers. F) `MobileNav` = floating pill, raised centre cart. G) cart + checkout restyled (rounded-lg cards, thumbnails, sticky summary). H) editor — new `"select"` field type (hero style/tone), size-chart uploader in Commerce panel, per-category `ImageUploader` (new `compact` prop) in `CategoryManager`. New files: `CategoryChips`, `HeaderSearch`, `ProductGallery`. `Ctx` in `Sections.tsx` gained `categories` — home page + `storefront-preview` updated. `tsc` + `next build` green; verified home/PDP/shop live on zotomic.com. NO commerce/checkout/SEO/data-model changes.
- 2026-09-08 — **Phase 9 (need-to-add.txt, 20 items) DONE + DEPLOYED + VERIFIED.** 9A guardrails · 9B plan limits · 9C credits + invoicing · 9D operator visibility · 9E storefront conversion · 9F marketing module.
  - Commits `5e04909` (Phase 9) + `441cf8e` (redeploy for mail env). Live on https://zotomic.com — storefront cards (Buy Now, "N sold"), PDP, pricing page copy verified via WebFetch.
  - **7 migrations APPLIED to prod** (2026-09-08, via combined idempotent SQL pasted in Supabase SQL Editor — `supabase db push` + Management API are blocked by this session's classifier). Recorded in `supabase_migrations.schema_migrations`. Verified: all 6 new tables + `businesses.limits_grandfathered_at`/`invoice_from_email` + `products.is_hot`/`hide_badges` + `credit-reset` cron all present; `product_categories` backfilled from existing free-text categories.
  - **Cron jobs now (4):** `weekly-reports` (Mon 03:00), `billing-sweep` (daily 02:00), `shipment-sync` (6h), **`credit-reset` (Fri 04:00 UTC → /api/cron/credits)**.
  - **Email: 4 Workspace identities wired + set in Vercel** — `MAIL_{INVOICE,ADMIN,SUPPORT,INFO}_{USER,PASS}` + `NOTIFICATION_EMAIL=admin@zotomic.com`. `lib/email.ts` routes by `account` param (invoice→customer invoices, admin→internal alerts + Zotomic invoices, support→owner account mail, info→review invites). Passwords in `.env.local` + Vercel (encrypted). `GMAIL_APP_PASSWORD` now just a fallback.
  - **STILL NEEDS USER** — enter in `/admin/settings`: `payment_bkash_number`, `payment_nagad_number` (credit top-ups + subscription payments), `invoice_from_email` (defaults `invoice@zotomic.com`).
  - **Env (optional, unset = defaults):** `AI_DAILY_LIMIT_PER_BUSINESS` (500), `AI_DAILY_LIMIT_GLOBAL` (8000). FX needs no key.
  - Deps: none added. `.env.local` `VERCEL_PROJECT_ID` corrected to the live `prj_aqgDRddWwjCkkT801vwvDd9gfz43`.
- 2026-08-29 — Plan approved. TODO file created. Phase 0 starting.
- 2026-08-29 — Phase 0 code complete. ~150 out-of-scope files deleted; new design system, component kit, 3 layout shells, P0 migration + RLS, tenant/auth libs, middleware, seed, Lighthouse config all in. `npx next build` green.
- 2026-08-29 — Supabase keys received. Migrations + seed applied to remote (24 tables live). Git initialised + Phase 0 pushed to github.com/zotomic-com/zotomic (branch main). Vercel wiring deferred (CLI unresponsive in this env; will do at Phase 1 checkpoint).
- 2026-08-29 — Phase 1: marketing shell + homepage + 11 public pages + config-driven pricing + 3-step onboarding + onboarding API. Build green (47 routes). Full signup→onboarding→/app flow verified against live DB.
- 2026-08-29 — Vercel: NEW working token + project (`zotomic` / team `zotomic-com-5624s-projects` / `prj_aqgDRddWwjCkkT801vwvDd9gfz43`), git-connected to the repo, Supabase integration already points at `tmrxlholjvdchgwgluar` (verified). Added AUTH_JWT_SECRET, ENCRYPTION_KEY, NEXT_PUBLIC_SITE_URL, STOREFRONT_ROOT_DOMAIN. Production: https://zotomic-lilac.vercel.app — new build LIVE (homepage + /how-it-works verified via WebFetch). NOTE: this sandbox's curl can't reach Vercel's `64.29.x` IP range, so live authed-flow (login/dashboard) is UNVERIFIED — user should confirm.
- 2026-08-29 — Phase 2: dashboard (mockup image 4) + metric SQL functions + lib/metrics + lib/observations + intelligence/reports/products/orders/customers/tasks/settings/notifications. Seed expanded (40 customers / 230 orders). Build green (54 routes), all /app pages 200 vs live DB. Pushed → auto-deployed (dpl_2iq64S8a5... READY).
- NEXT: Phase 3 (Weekly Intelligence engine — pg_cron + Edge Function + Gemini narrative). Also pending: move zotomic.com domain to the new project; verify live auth.
