import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { PinKeypad } from "../src/components/PinKeypad";
import { useToast } from "../src/components/Toast";
import { bioLock, pinLock } from "../src/lock";
import { colors, spacing, type, font } from "../src/theme";

export default function Lock() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { token, loading, user, markUnlocked, signOut } = useAuth();

  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);

  // If we ever land on /lock without a token (e.g. session revoked), bounce out.
  useEffect(() => {
    if (!loading && !token) router.replace("/welcome");
  }, [loading, token, router]);

  const tryBio = useCallback(async () => {
    if (!(await bioLock.isEnabled())) return;
    const ok = await bioLock.authenticate("Sblocca FiskID");
    if (ok) {
      markUnlocked();
      router.replace("/dashboard");
    }
  }, [markUnlocked, router]);

  useEffect(() => {
    (async () => {
      const hw = await bioLock.hardwareSupported();
      const on = await bioLock.isEnabled();
      setBioAvailable(hw && on);
      if (hw && on) tryBio();
    })();
  }, [tryBio]);

  useEffect(() => {
    if (pin.length !== 6) return;
    (async () => {
      const ok = await pinLock.verify(pin);
      if (ok) {
        setError(false);
        markUnlocked();
        router.replace("/dashboard");
      } else {
        setError(true);
        setTimeout(() => { setPin(""); setError(false); }, 700);
        toast.show("PIN errato", "error");
      }
    })();
  }, [pin, markUnlocked, router, toast]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.top}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>FiskID</Text>
        </View>
        <Text style={styles.title}>Sblocca</Text>
        <Text style={styles.body} numberOfLines={1}>{user?.email}</Text>
      </View>

      <PinKeypad
        value={pin}
        onChange={setPin}
        error={error}
        onBiometric={bioAvailable ? tryBio : null}
        biometricLabel="⁂"
      />

      <Pressable testID="lock-signout" onPress={signOut} style={styles.signout}>
        <Text style={styles.signoutText}>Esci e usa un altro account</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xl },
  top: { alignItems: "center", gap: spacing.sm, marginTop: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.lg },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandSecondary },
  brand: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 2.5 },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 36, letterSpacing: -0.4 },
  body: { ...type.body, textAlign: "center", maxWidth: 320 },
  signout: { paddingVertical: spacing.md },
  signoutText: { color: colors.muted, fontSize: 13, textAlign: "center" },
});
