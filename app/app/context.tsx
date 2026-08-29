"use client";

import { createContext, useContext } from "react";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface AppBusiness {
  id: string;
  name: string;
  type?: string;
  slug?: string;
  currency?: string;
  membershipRole?: string;
  isDefault?: boolean;
}

interface AppState {
  user: AppUser | null;
  business: AppBusiness | null;
  businesses: AppBusiness[];
  logout: () => void;
}

export const AppContext = createContext<AppState>({
  user: null,
  business: null,
  businesses: [],
  logout: () => {},
});

export const useApp = () => useContext(AppContext);
