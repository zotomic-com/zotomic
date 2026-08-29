import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Server-side admin client — uses service role for full access
export function getAdminSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    // Fallback to anon key during build — APIs will be restricted
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  return createClient(supabaseUrl, serviceKey);
}

// Client-side public Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types
export interface Lead {
  id: string;
  name: string;
  email: string;
  phone?: string;
  plan: string;
  business?: string;
  message: string;
  status: "new" | "contacted" | "converted" | "lost";
  notes?: string;
  created_at: string;
}

export interface Work {
  id: string;
  title: string;
  description: string;
  client_name?: string;
  category: string;
  image_url?: string;
  live_url?: string;
  tags: string[];
  featured: boolean;
  sort_order: number;
  created_at: string;
}

export interface Affiliate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  referral_code: string;
  status: "pending" | "approved" | "suspended" | "rejected";
  commission_rate: number;
  payout_method: string;
  payout_details?: string;
  total_referrals: number;
  total_earnings: number;
  total_paid: number;
  notes?: string;
  created_at: string;
}

export interface AffiliateReferral {
  id: string;
  affiliate_id: string;
  lead_id?: string;
  referral_code: string;
  plan?: string;
  amount: number;
  commission: number;
  status: "pending" | "approved" | "paid";
  created_at: string;
}

export interface Notification {
  id: string;
  type: string;
  recipient: string;
  subject?: string;
  body?: string;
  status: "sent" | "failed" | "pending";
  metadata: Record<string, unknown>;
  created_at: string;
}
