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

// -------- Auth --------
export const apiRegister = (email: string, password: string) =>
  apiRequest<{ access_token: string }>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });

export const apiLogin = (identifier: string, password: string) =>
  apiRequest<{ access_token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
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

// -------- Fiscal profile (multi) --------
export type FiscalProfile = {
  id?: string;
  label?: string | null;
  is_default?: boolean;
  is_delegate?: boolean;
  permissions?: ("send" | "receive")[];
  admin_email?: string | null;
  delegation_id?: string | null;
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

export const apiListProfiles = (token: string) =>
  apiRequest<{ profiles: FiscalProfile[] }>("/fiscal-profiles", {}, token);

export const apiGetProfile = (token: string, id: string) =>
  apiRequest<{ profile: FiscalProfile }>(`/fiscal-profiles/${id}`, {}, token);

// legacy singular getter — returns the default profile (or null)
export const apiGetDefaultProfile = (token: string) =>
  apiRequest<{ profile: FiscalProfile | null }>("/fiscal-profile", {}, token);

export const apiCreateProfile = (token: string, payload: FiscalProfile) =>
  apiRequest<{ profile: FiscalProfile }>(
    "/fiscal-profiles",
    { method: "POST", body: JSON.stringify(payload) },
    token,
  );

export const apiUpdateProfile = (token: string, id: string, payload: FiscalProfile) =>
  apiRequest<{ profile: FiscalProfile }>(
    `/fiscal-profiles/${id}`,
    { method: "PUT", body: JSON.stringify(payload) },
    token,
  );

export const apiSetDefaultProfile = (token: string, id: string) =>
  apiRequest<{ ok: true }>(
    `/fiscal-profiles/${id}/set-default`,
    { method: "POST" },
    token,
  );

export const apiDeleteProfile = (token: string, id: string) =>
  apiRequest<{ ok: true }>(
    `/fiscal-profiles/${id}`,
    { method: "DELETE" },
    token,
  );

// -------- Delegates --------
export type Delegate = {
  id: string;
  email: string;
  permissions: ("send" | "receive")[];
  status: "invited" | "active" | "revoked";
  linked: boolean;
  created_at: string | null;
  resolved_at: string | null;
  revoked_at: string | null;
};

export const apiListDelegates = (token: string, profileId: string) =>
  apiRequest<{ delegates: Delegate[] }>(
    `/fiscal-profiles/${profileId}/delegates`,
    {},
    token,
  );

export const apiAddDelegate = (
  token: string,
  profileId: string,
  email: string,
  permissions: ("send" | "receive")[],
) =>
  apiRequest<{ delegate: Delegate }>(
    `/fiscal-profiles/${profileId}/delegates`,
    { method: "POST", body: JSON.stringify({ email, permissions }) },
    token,
  );

export const apiUpdateDelegate = (
  token: string,
  profileId: string,
  delegateId: string,
  permissions: ("send" | "receive")[],
) =>
  apiRequest<{ delegate: Delegate }>(
    `/fiscal-profiles/${profileId}/delegates/${delegateId}`,
    { method: "PATCH", body: JSON.stringify({ permissions }) },
    token,
  );

export const apiRevokeDelegate = (token: string, profileId: string, delegateId: string) =>
  apiRequest<{ ok: true }>(
    `/fiscal-profiles/${profileId}/delegates/${delegateId}`,
    { method: "DELETE" },
    token,
  );

// -------- Wallet --------
export const apiWalletTokens = (token: string, profileId: string) =>
  apiRequest<{ apple_url: string; google_url: string; note: string }>(
    `/fiscal-profiles/${profileId}/wallet-tokens`,
    { method: "POST" },
    token,
  );

export const walletFullUrl = (path: string) => `${APP_BASE_URL}${path}`;

// -------- Shares --------
export const apiCreateShare = (token: string, profileId?: string | null) =>
  apiRequest<{ token: string; created_at: string; profile_id: string; profile_label: string | null }>(
    "/shares",
    {
      method: "POST",
      body: JSON.stringify(profileId ? { fiscal_profile_id: profileId } : {}),
    },
    token,
  );

export const apiShareHistory = (token: string) =>
  apiRequest<{ shares: any[] }>("/shares/history", {}, token);

export const apiRevokeShare = (token: string, shareToken: string) =>
  apiRequest<{ ok: true }>(
    `/shares/${shareToken}/revoke`,
    { method: "POST" },
    token,
  );

// -------- Public share (no auth) --------
export const apiPublicShareGet = (shareToken: string) =>
  apiRequest<{ profile: any; confirmed_at: string | null }>(
    `/public/share/${shareToken}`,
  );

export const apiPublicShareConfirm = (shareToken: string) =>
  apiRequest<{ ok: boolean; confirmed_at: string }>(
    `/public/share/${shareToken}/confirm`,
    { method: "POST", body: JSON.stringify({}) },
  );

// -------- Events --------
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
