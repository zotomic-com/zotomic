"use client";

import { createContext, useContext } from "react";

/**
 * The admin-managed site logo (Website → Branding), shared with client
 * components such as the dashboard sidebars so they render exactly the same
 * mark as the public header. Passed down from the root layout through
 * ConditionalLayout, so no extra request is needed.
 */
const SiteBrandingContext = createContext<{ logoUrl: string }>({ logoUrl: "" });

export function SiteBrandingProvider({
  logoUrl,
  children,
}: {
  logoUrl?: string;
  children: React.ReactNode;
}) {
  return (
    <SiteBrandingContext.Provider value={{ logoUrl: logoUrl ?? "" }}>
      {children}
    </SiteBrandingContext.Provider>
  );
}

export function useSiteLogo(): string {
  return useContext(SiteBrandingContext).logoUrl;
}
