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

- [x] Assistant tools **19 total** now — added `send_report_telegram` + `send_report_email` (from `Assistant@zotomic.com`, via `EMAIL_ASSISTANT_FROM`). `lib/reports/deliver.ts` + `report_deliveries` table.
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
- [x] Store-owner invoices (paid) — branded printable `/app/billing/invoice/[id]` with store logo, Print/Save-as-PDF, email invoice
- [ ] Real Hermes VPS client (`hermes_base_url` now enterable in `/admin/integrations`; `runAgent` still the local Gemini loop until wired)
- [ ] n8n live calls (`n8n_base_url` / `n8n_api_key` enterable in `/admin/integrations`; not yet consumed)
- [ ] Admin: tenant CSV export, richer system-health history

**Data model:** `ProductVariant`, `Inventory` (as `inventory_adjustments`), `Return` — DONE. `Domain` still folded into integrations.

---

## LOG

- 2026-08-29 — Plan approved. TODO file created. Phase 0 starting.
- 2026-08-29 — Phase 0 code complete. ~150 out-of-scope files deleted; new design system, component kit, 3 layout shells, P0 migration + RLS, tenant/auth libs, middleware, seed, Lighthouse config all in. `npx next build` green.
- 2026-08-29 — Supabase keys received. Migrations + seed applied to remote (24 tables live). Git initialised + Phase 0 pushed to github.com/zotomic-com/zotomic (branch main). Vercel wiring deferred (CLI unresponsive in this env; will do at Phase 1 checkpoint).
- 2026-08-29 — Phase 1: marketing shell + homepage + 11 public pages + config-driven pricing + 3-step onboarding + onboarding API. Build green (47 routes). Full signup→onboarding→/app flow verified against live DB.
- 2026-08-29 — Vercel: NEW working token + project (`zotomic` / team `zotomic-com-5624s-projects` / `prj_aqgDRddWwjCkkT801vwvDd9gfz43`), git-connected to the repo, Supabase integration already points at `tmrxlholjvdchgwgluar` (verified). Added AUTH_JWT_SECRET, ENCRYPTION_KEY, NEXT_PUBLIC_SITE_URL, STOREFRONT_ROOT_DOMAIN. Production: https://zotomic-lilac.vercel.app — new build LIVE (homepage + /how-it-works verified via WebFetch). NOTE: this sandbox's curl can't reach Vercel's `64.29.x` IP range, so live authed-flow (login/dashboard) is UNVERIFIED — user should confirm.
- 2026-08-29 — Phase 2: dashboard (mockup image 4) + metric SQL functions + lib/metrics + lib/observations + intelligence/reports/products/orders/customers/tasks/settings/notifications. Seed expanded (40 customers / 230 orders). Build green (54 routes), all /app pages 200 vs live DB. Pushed → auto-deployed (dpl_2iq64S8a5... READY).
- NEXT: Phase 3 (Weekly Intelligence engine — pg_cron + Edge Function + Gemini narrative). Also pending: move zotomic.com domain to the new project; verify live auth.
