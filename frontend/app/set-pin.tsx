import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { PinKeypad } from "../src/components/PinKeypad";
import { AppButton } from "../src/components/AppButton";
import { useToast } from "../src/components/Toast";
import { bioLock, pinLock } from "../src/lock";
import { colors, spacing, type, font } from "../src/theme";

type Step = "choose" | "confirm";

export default function SetPin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { token, loading, markUnlocked, refreshLockState } = useAuth();

  const [step, setStep] = useState<Step>("choose");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [useBio, setUseBio] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !token) router.replace("/welcome");
  }, [loading, token, router]);

  useEffect(() => {
    (async () => {
      const ok = await bioLock.hardwareSupported();
      setBioSupported(ok);
      setUseBio(ok);
    })();
  }, []);

  useEffect(() => {
    if (step === "choose" && pin.length === 6) {
      setStep("confirm");
    }
  }, [pin, step]);

  useEffect(() => {
    if (step !== "confirm" || confirm.length !== 6) return;
    if (confirm !== pin) {
      setError(true);
      toast.show("I PIN non coincidono", "error");
      setTimeout(() => { setConfirm(""); setPin(""); setStep("choose"); setError(false); }, 700);
      return;
    }
    (async () => {
      setSaving(true);
      try {
        await pinLock.setPin(pin);
        await bioLock.setEnabled(bioSupported && useBio);
        await refreshLockState();
        markUnlocked();
        toast.show("PIN impostato", "success");
        router.replace("/dashboard");
      } catch (e: any) {
        toast.show(e.message || "Errore", "error");
      } finally {
        setSaving(false);
      }
    })();
  }, [confirm, pin, step, useBio, bioSupported, markUnlocked, refreshLockState, router, toast]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
      <View style={styles.top}>
        <Text style={styles.eyebrow}>SICUREZZA</Text>
        <Text style={styles.title}>
          {step === "choose" ? "Crea un PIN a 6 cifre" : "Conferma il tuo PIN"}
        </Text>
        <Text style={styles.body}>
          {step === "choose"
            ? "Il PIN protegge l'app sul tuo dispositivo. Ti sarà chiesto a ogni apertura."
            : "Inserisci di nuovo lo stesso PIN per confermare."}
        </Text>
      </View>

      <PinKeypad
        value={step === "choose" ? pin : confirm}
        onChange={step === "choose" ? setPin : setConfirm}
        error={error}
      />

      {step === "choose" && bioSupported && (
        <View style={styles.bioRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bioTitle}>Sblocco biometrico</Text>
            <Text style={styles.bioBody}>Usa Face ID / Touch ID per aprire l'app.</Text>
          </View>
          <Switch
            testID="bio-toggle"
            value={useBio}
            onValueChange={setUseBio}
            trackColor={{ true: colors.brandSecondary, false: colors.border }}
            thumbColor={colors.onSurface}
          />
        </View>
      )}

      {step === "confirm" && (
        <AppButton
          testID="setpin-back"
          title="Modifica PIN"
          variant="ghost"
          onPress={() => { setConfirm(""); setPin(""); setStep("choose"); }}
        />
      )}

      {saving && <Text style={styles.saving}>Salvataggio…</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl, gap: spacing.xl, alignItems: "center" },
  top: { alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 30, letterSpacing: -0.3, textAlign: "center" },
  body: { ...type.body, textAlign: "center", maxWidth: 320 },
  bioRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, alignSelf: "stretch",
  },
  bioTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  bioBody: { color: colors.muted, fontSize: 12, marginTop: 2 },
  saving: { color: colors.muted, fontSize: 12 },
});
