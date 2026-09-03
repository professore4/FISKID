import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const KEY = "fiskid_access_token";

export const tokenStorage = {
  get: () =>
    Platform.OS === "web"
      ? AsyncStorage.getItem(KEY)
      : SecureStore.getItemAsync(KEY),
  set: (v: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem(KEY, v)
      : SecureStore.setItemAsync(KEY, v),
  clear: () =>
    Platform.OS === "web"
      ? AsyncStorage.removeItem(KEY)
      : SecureStore.deleteItemAsync(KEY),
};

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;
export const API_BASE = `${BASE}/api`;
export const APP_BASE_URL = BASE;

export type ApiError = { detail?: any };

export async function apiRequest<T = any>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { detail: text };
  }
  if (!res.ok) {
    const err: any = new Error(
      typeof data.detail === "string" ? data.detail : "Richiesta non riuscita",
    );
    err.status = res.status;
    err.detail = data.detail;
    throw err;
  }
  return data;
}

// Auth
export const apiRegister = (email: string, password: string) =>
  apiRequest<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const apiLogin = (email: string, password: string) =>
  apiRequest<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const apiMe = (token: string) =>
  apiRequest<{ id: string; email: string }>("/auth/me", {}, token);

export const apiForgotPassword = (email: string) =>
  apiRequest<{ message: string; dev_reset_token?: string }>(
    "/auth/forgot-password",
    { method: "POST", body: JSON.stringify({ email }) },
  );

export const apiResetPassword = (token: string, new_password: string) =>
  apiRequest<{ message: string }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });

// Fiscal profile
export type FiscalProfile = {
  id?: string;
  entity_type: "individual" | "professional" | "company";
  first_name?: string | null;
  last_name?: string | null;
  business_name?: string | null;
  vat_number?: string | null;
  tax_code?: string | null;
  address: string;
  street_number?: string | null;
  postal_code: string;
  city: string;
  province: string;
  country: string;
  recipient_code?: string | null;
  pec?: string | null;
  contact_email: string;
  contact_phone?: string | null;
};

export const apiGetProfile = (token: string) =>
  apiRequest<{ profile: FiscalProfile | null }>("/fiscal-profile", {}, token);

export const apiSaveProfile = (token: string, payload: FiscalProfile) =>
  apiRequest<{ profile: FiscalProfile }>(
    "/fiscal-profile",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );

// Shares
export const apiCreateShare = (token: string) =>
  apiRequest<{ token: string; created_at: string }>(
    "/shares",
    { method: "POST" },
    token,
  );

export const apiShareHistory = (token: string) =>
  apiRequest<{ shares: any[] }>("/shares/history", {}, token);

// Public share (no auth)
export const apiPublicShareGet = (shareToken: string) =>
  apiRequest<{ profile: any; confirmed_at: string | null }>(
    `/public/share/${shareToken}`,
  );

export const apiPublicShareConfirm = (shareToken: string) =>
  apiRequest<{ ok: boolean; confirmed_at: string }>(
    `/public/share/${shareToken}/confirm`,
    { method: "POST", body: JSON.stringify({}) },
  );

// Events
export const apiTrackEvent = (
  event_name: string,
  event_metadata: Record<string, any> = {},
  token?: string | null,
) =>
  apiRequest(
    "/events",
    { method: "POST", body: JSON.stringify({ event_name, event_metadata }) },
    token,
  ).catch(() => null);
