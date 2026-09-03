import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiLogin, apiMe, apiRegister, tokenStorage } from "./api";
import { pinLock } from "./lock";

type User = { id: string; email: string } | null;

type AuthCtx = {
  token: string | null;
  user: User;
  loading: boolean;
  hasPin: boolean;
  unlocked: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  markUnlocked: () => void;
  requireLock: () => void;
  refreshLockState: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  const refreshLockState = useCallback(async () => {
    const enabled = await pinLock.isEnabled();
    setHasPin(enabled);
    if (!enabled) setUnlocked(true); // no pin set → app effectively unlocked
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const t = await tokenStorage.get();
        if (t) {
          const u = await apiMe(t);
          setToken(t);
          setUser(u);
        }
        await refreshLockState();
      } catch {
        await tokenStorage.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshLockState]);

  const establish = useCallback(async (t: string) => {
    await tokenStorage.set(t);
    setToken(t);
    const u = await apiMe(t);
    setUser(u);
  }, []);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      const res = await apiLogin(identifier, password);
      await establish(res.access_token);
      // Fresh login always requires unlock again if a PIN is configured
      const enabled = await pinLock.isEnabled();
      setHasPin(enabled);
      setUnlocked(!enabled);
    },
    [establish],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const res = await apiRegister(email, password);
      await establish(res.access_token);
      // New account never has a PIN yet
      setHasPin(false);
      setUnlocked(true);
    },
    [establish],
  );

  const signOut = useCallback(async () => {
    await tokenStorage.clear();
    setToken(null);
    setUser(null);
    setUnlocked(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const u = await apiMe(token);
      setUser(u);
    } catch {
      await signOut();
    }
  }, [token, signOut]);

  const markUnlocked = useCallback(() => setUnlocked(true), []);
  const requireLock = useCallback(() => setUnlocked(false), []);

  return (
    <Ctx.Provider value={{
      token, user, loading, hasPin, unlocked,
      signIn, signUp, signOut, refresh,
      markUnlocked, requireLock, refreshLockState,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
};
