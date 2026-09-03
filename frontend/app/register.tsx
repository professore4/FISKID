import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { AppButton } from "../src/components/AppButton";
import { AppInput } from "../src/components/AppInput";
import { useToast } from "../src/components/Toast";
import { colors, spacing, type, font } from "../src/theme";
import { apiTrackEvent } from "../src/api";

export default function Register() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { signUp } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const onSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) errs.email = "Email non valida";
    if (password.length < 8) errs.password = "Minimo 8 caratteri";
    if (confirm !== password) errs.confirm = "Le password non coincidono";
    setErr(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await signUp(email.trim(), password);
      apiTrackEvent("user_registered");
      router.replace("/onboarding");
    } catch (e: any) {
      const msg = typeof e.detail === "string" ? e.detail : e.message;
      toast.show(msg || "Errore durante la registrazione", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.container,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable testID="register-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>

        <Text style={styles.title}>Crea il tuo account</Text>
        <Text style={styles.subtitle}>
          Un solo passo per iniziare a proteggere la comunicazione dei tuoi dati fiscali.
        </Text>

        <View style={styles.form}>
          <AppInput
            testID="register-email-input"
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            placeholder="mario.rossi@example.com"
            error={err.email}
          />
          <AppInput
            testID="register-password-input"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Almeno 8 caratteri"
            error={err.password}
          />
          <AppInput
            testID="register-confirm-input"
            label="Conferma password"
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="Ripeti la password"
            error={err.confirm}
          />

          <AppButton
            testID="register-submit-button"
            title="Crea account"
            onPress={onSubmit}
            loading={loading}
          />

          <Pressable testID="register-login-link" onPress={() => router.replace("/login")} style={{ alignItems: "center", marginTop: spacing.md }}>
            <Text style={{ color: colors.onSurfaceSecondary }}>
              Hai già un account? <Text style={{ color: colors.brandSecondary, fontWeight: "700" }}>Accedi</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.xl, gap: spacing.md },
  back: { paddingVertical: spacing.sm },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 32, marginTop: spacing.lg, letterSpacing: -0.4 },
  subtitle: { ...type.body, marginBottom: spacing.lg, maxWidth: 320 },
  form: { gap: spacing.xs },
});
