import { useEffect, useState } from "react";
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
import { rememberedIdentifier } from "../src/lock";
import { pinLock } from "../src/lock";

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const toast = useToast();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      const saved = await rememberedIdentifier.get();
      if (saved) setIdentifier(saved);
    })();
  }, []);

  const onSubmit = async () => {
    const errs: Record<string, string> = {};
    const id = identifier.trim();
    if (id.length < 3) errs.identifier = "Inserisci email, P.IVA o CF";
    if (!password) errs.password = "Inserisci la password";
    setErr(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await signIn(id, password);
      if (remember) {
        await rememberedIdentifier.set(id);
      } else {
        await rememberedIdentifier.clear();
      }
      // Route: if no PIN set yet → prompt to create one; if PIN set → require unlock
      if (await pinLock.isEnabled()) {
        router.replace("/lock");
      } else {
        router.replace("/set-pin");
      }
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
        <Pressable
          testID="login-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
          style={styles.back}
        >
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>

        <Text style={styles.title}>Bentornato</Text>
        <Text style={styles.subtitle}>Accedi con email, P.IVA o codice fiscale.</Text>

        <View style={styles.form}>
          <AppInput
            testID="login-email-input"
            label="Email, P.IVA o codice fiscale"
            value={identifier}
            onChangeText={setIdentifier}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="username"
            placeholder="mario@example.com · 12345678901 · RSSMRA…"
            error={err.identifier}
          />
          <AppInput
            testID="login-password-input"
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            placeholder="La tua password"
            error={err.password}
          />

          <Pressable
            testID="login-remember-toggle"
            onPress={() => setRemember(!remember)}
            style={styles.rememberRow}
          >
            <View style={[styles.tickBox, remember && styles.tickBoxOn]}>
              {remember ? <Text style={styles.tick}>✓</Text> : null}
            </View>
            <Text style={styles.rememberText}>Ricordami su questo dispositivo</Text>
          </Pressable>

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
  subtitle: { ...type.body, marginBottom: spacing.lg, maxWidth: 340 },
  form: { gap: spacing.xs },
  rememberRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
  },
  tickBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  tickBoxOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tick: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "900" },
  rememberText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "500" },
});
