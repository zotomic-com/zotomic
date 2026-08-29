import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  Globe,
  Image as ImageIcon,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MessageSquareText,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  RotateCcw,
  Star,
  Store,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Tenant app sidebar — order matches the approved dashboard mockup. */
export const APP_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/intelligence", label: "Weekly Report", icon: BarChart3 },
  { href: "/app/assistant", label: "Zotomic Assistant", icon: MessageSquareText },
  { href: "/app/products", label: "Products", icon: Boxes },
  { href: "/app/inventory", label: "Inventory", icon: Warehouse },
  { href: "/app/orders", label: "Orders", icon: ShoppingCart },
  { href: "/app/returns", label: "Returns", icon: RotateCcw },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/messages", label: "Messages", icon: MessageSquareText },
  { href: "/app/reviews", label: "Reviews", icon: Star },
  { href: "/app/storefront", label: "Storefront", icon: Store },
  { href: "/app/media", label: "Media", icon: ImageIcon },
  { href: "/app/marketing", label: "Marketing", icon: Megaphone },
  { href: "/app/tasks", label: "Tasks", icon: ListChecks },
  { href: "/app/website", label: "Website", icon: Globe },
  { href: "/app/integrations", label: "Integrations", icon: Plug },
  { href: "/app/billing", label: "Billing", icon: CreditCard },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

/** Admin console sidebar — order matches the approved admin mockup. */
export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/tenants", label: "Tenants / Businesses", icon: Building2 },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: CreditCard },
  { href: "/admin/financials", label: "Financials", icon: Wallet },
  { href: "/admin/usage", label: "Usage & Credits", icon: Activity },
  { href: "/admin/websites", label: "Websites", icon: Globe },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/assistant-activity", label: "Assistant Activity", icon: MessageSquareText },
  { href: "/admin/content-library", label: "Pages & Legal", icon: ScrollText },
  { href: "/admin/integrations", label: "Integrations", icon: Plug },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone },
  { href: "/admin/users", label: "Users & Roles", icon: Users },
  { href: "/admin/audit-logs", label: "Audit Logs", icon: ShieldCheck },
  { href: "/admin/system-health", label: "System Health", icon: Activity },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];
