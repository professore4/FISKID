import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../src/components/AppButton";
import { AppInput } from "../src/components/AppInput";
import { useToast } from "../src/components/Toast";
import { apiForgotPassword, apiResetPassword } from "../src/api";
import { colors, spacing, type, font } from "../src/theme";

export default function ForgotPassword() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [step, setStep] = useState<"request" | "reset">("request");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);

  const onRequest = async () => {
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      toast.show("Email non valida", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await apiForgotPassword(email.trim());
      if (res.dev_reset_token) {
        setDevToken(res.dev_reset_token);
        setStep("reset");
        toast.show("Token generato (modalità sviluppo)", "info");
      } else {
        toast.show(res.message || "Se l'account esiste, riceverai istruzioni.", "success");
      }
    } catch (e: any) {
      toast.show(e.detail || e.message || "Errore", "error");
    } finally {
      setLoading(false);
    }
  };

  const onReset = async () => {
    if (!devToken || newPass.length < 8) {
      toast.show("Password minima 8 caratteri", "error");
      return;
    }
    setLoading(true);
    try {
      await apiResetPassword(devToken, newPass);
      toast.show("Password aggiornata", "success");
      router.replace("/login");
    } catch (e: any) {
      toast.show(e.detail || e.message || "Errore", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable testID="forgot-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>

        <Text style={styles.title}>Recupero password</Text>
        <Text style={styles.subtitle}>
          {step === "request"
            ? "Inserisci la tua email per ricevere le istruzioni di reset."
            : "Imposta la tua nuova password."}
        </Text>

        {step === "request" ? (
          <>
            <AppInput
              testID="forgot-email-input"
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder="mario.rossi@example.com"
            />
            <AppButton
              testID="forgot-submit-button"
              title="Richiedi reset"
              onPress={onRequest}
              loading={loading}
            />
          </>
        ) : (
          <>
            <View testID="forgot-dev-token" style={styles.devNotice}>
              <Text style={styles.devLabel}>Modalità sviluppo</Text>
              <Text style={styles.devText}>Token generato: {devToken?.slice(0, 12)}…</Text>
            </View>
            <AppInput
              testID="forgot-new-password-input"
              label="Nuova password"
              value={newPass}
              onChangeText={setNewPass}
              secureTextEntry
              placeholder="Almeno 8 caratteri"
            />
            <AppButton
              testID="forgot-reset-button"
              title="Aggiorna password"
              onPress={onReset}
              loading={loading}
            />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  back: { paddingVertical: spacing.sm },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 30, marginTop: spacing.lg, letterSpacing: -0.4 },
  subtitle: { ...type.body, marginBottom: spacing.lg },
  devNotice: {
    borderWidth: 1,
    borderColor: colors.brandTertiary,
    backgroundColor: "rgba(6,78,59,0.3)",
    padding: spacing.md,
    borderRadius: 12,
    marginBottom: spacing.sm,
  },
  devLabel: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  devText: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
});
