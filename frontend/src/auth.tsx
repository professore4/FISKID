import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiLogin, apiMe, apiRegister, tokenStorage } from "./api";

type User = { id: string; email: string } | null;

type AuthCtx = {
  token: string | null;
  user: User;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const t = await tokenStorage.get();
        if (t) {
          const u = await apiMe(t);
          setToken(t);
          setUser(u);
        }
      } catch {
        await tokenStorage.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const establish = useCallback(async (t: string) => {
    await tokenStorage.set(t);
    setToken(t);
    const u = await apiMe(t);
    setUser(u);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const res = await apiLogin(email, password);
      await establish(res.access_token);
    },
    [establish],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      const res = await apiRegister(email, password);
      await establish(res.access_token);
    },
    [establish],
  );

  const signOut = useCallback(async () => {
    await tokenStorage.clear();
    setToken(null);
    setUser(null);
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

  return (
    <Ctx.Provider value={{ token, user, loading, signIn, signUp, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("AuthProvider missing");
  return c;
};
