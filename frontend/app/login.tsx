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

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const onSubmit = async () => {
    const errs: Record<string, string> = {};
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) errs.email = "Email non valida";
    if (!password) errs.password = "Inserisci la password";
    setErr(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/dashboard");
    } catch (e: any) {
      toast.show(e.detail || e.message || "Errore accesso", "error");
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
        <Pressable testID="login-back" onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>

        <Text style={styles.title}>Bentornato</Text>
        <Text style={styles.subtitle}>Accedi alla tua identità fiscale.</Text>

        <View style={styles.form}>
          <AppInput
            testID="login-email-input"
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
            testID="login-password-input"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="La tua password"
            error={err.password}
          />

          <Pressable
            testID="login-forgot-link"
            onPress={() => router.push("/forgot-password")}
            style={{ alignSelf: "flex-end", paddingVertical: spacing.sm }}
          >
            <Text style={{ color: colors.brandSecondary, fontSize: 13, fontWeight: "600" }}>
              Password dimenticata?
            </Text>
          </Pressable>

          <AppButton
            testID="login-submit-button"
            title="Accedi"
            onPress={onSubmit}
            loading={loading}
          />

          <Pressable
            testID="login-register-link"
            onPress={() => router.replace("/register")}
            style={{ alignItems: "center", marginTop: spacing.md }}
          >
            <Text style={{ color: colors.onSurfaceSecondary }}>
              Non hai un account? <Text style={{ color: colors.brandSecondary, fontWeight: "700" }}>Registrati</Text>
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  container: { paddingHorizontal: spacing.xl },
  back: { paddingVertical: spacing.sm },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 32, marginTop: spacing.lg, letterSpacing: -0.4 },
  subtitle: { ...type.body, marginBottom: spacing.lg },
  form: { gap: spacing.xs },
});
