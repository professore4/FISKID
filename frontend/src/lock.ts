import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import * as LocalAuthentication from "expo-local-authentication";

const PIN_KEY = "fiskid_pin_hash";
const BIO_KEY = "fiskid_bio_enabled";
const REMEMBER_KEY = "fiskid_remembered_identifier";

// SecureStore is native-only. On web we fall back to AsyncStorage (unencrypted,
// acceptable for a PIN hash + biometric flag on the web preview).
const store = {
  get: (k: string) =>
    Platform.OS === "web" ? AsyncStorage.getItem(k) : SecureStore.getItemAsync(k),
  set: (k: string, v: string) =>
    Platform.OS === "web" ? AsyncStorage.setItem(k, v) : SecureStore.setItemAsync(k, v),
  clear: (k: string) =>
    Platform.OS === "web" ? AsyncStorage.removeItem(k) : SecureStore.deleteItemAsync(k),
};

async function sha256(input: string): Promise<string> {
  // Use Web Crypto when available (works in Expo Web + modern React Native via polyfill).
  const g: any = globalThis as any;
  const subtle = g?.crypto?.subtle;
  if (subtle && typeof subtle.digest === "function") {
    const buf = new TextEncoder().encode(input);
    const hash = await subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  // Fallback: cheap FNV-1a hash — not cryptographically secure, but PIN is
  // already protected by device-level SecureStore. Only reached on very old
  // engines that don't ship SubtleCrypto.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(16, "0");
}

export const pinLock = {
  async isEnabled(): Promise<boolean> {
    return !!(await store.get(PIN_KEY));
  },
  async setPin(pin: string): Promise<void> {
    if (!/^\d{6}$/.test(pin)) throw new Error("Il PIN deve essere di 6 cifre");
    await store.set(PIN_KEY, await sha256(pin));
  },
  async verify(pin: string): Promise<boolean> {
    const saved = await store.get(PIN_KEY);
    if (!saved) return false;
    return saved === (await sha256(pin));
  },
  async clear(): Promise<void> {
    await store.clear(PIN_KEY);
    await store.clear(BIO_KEY);
  },
};

export const bioLock = {
  async hardwareSupported(): Promise<boolean> {
    if (Platform.OS === "web") return false;
    try {
      const has = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      return has && enrolled;
    } catch {
      return false;
    }
  },
  async isEnabled(): Promise<boolean> {
    if (Platform.OS === "web") return false;
    return (await store.get(BIO_KEY)) === "1";
  },
  async setEnabled(on: boolean): Promise<void> {
    await store.set(BIO_KEY, on ? "1" : "0");
  },
  async authenticate(reason = "Sblocca FiskID"): Promise<boolean> {
    if (Platform.OS === "web") return false;
    try {
      const res = await LocalAuthentication.authenticateAsync({
        promptMessage: reason,
        cancelLabel: "Usa PIN",
        disableDeviceFallback: true,
      });
      return res.success;
    } catch {
      return false;
    }
  },
};

export const rememberedIdentifier = {
  get: () => store.get(REMEMBER_KEY),
  set: (v: string) => store.set(REMEMBER_KEY, v),
  clear: () => store.clear(REMEMBER_KEY),
};
