"use client";

import { createContext, useContext } from "react";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  isTestAccount: boolean;
  theme?: "light" | "dark";
  accent?: string;
};

export type SessionState = {
  user: SessionUser | null;
  coins: number;
  ready: boolean;
  refresh: () => void;
};

export const SessionContext = createContext<SessionState>({ user: null, coins: 0, ready: false, refresh: () => {} });

export function useSession() {
  return useContext(SessionContext);
}
