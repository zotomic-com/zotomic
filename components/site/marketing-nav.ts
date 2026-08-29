import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  HelpCircle,
  Home,
  Info,
  Mail,
  MessageSquareText,
  Store,
  Tag,
} from "lucide-react";

export interface MarketingNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  group: "primary" | "secondary";
}

/** Public site nav — order + items match the approved homepage mockup. */
export const MARKETING_NAV: MarketingNavItem[] = [
  { href: "/", label: "Home", icon: Home, group: "primary" },
  { href: "/intelligence", label: "Intelligence", icon: BarChart3, group: "primary" },
  { href: "/assistant", label: "Assistant", icon: MessageSquareText, group: "primary" },
  { href: "/storefront", label: "Storefront", icon: Store, group: "primary" },
  { href: "/pricing", label: "Pricing", icon: Tag, group: "primary" },
  { href: "/about", label: "About", icon: Info, group: "secondary" },
  { href: "/contact", label: "Contact", icon: Mail, group: "secondary" },
  { href: "/help", label: "Help", icon: HelpCircle, group: "secondary" },
];
