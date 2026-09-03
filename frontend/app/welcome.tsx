import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../src/components/AppButton";
import { colors, IMAGES, spacing, type, font } from "../src/theme";

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Image
        source={{ uri: IMAGES.welcomeBackground }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={500}
      />
      <LinearGradient
        colors={["rgba(5,5,5,0.2)", "rgba(5,5,5,0.7)", "rgba(5,5,5,0.98)"]}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[styles.top, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>FiskID</Text>
        </View>
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.eyebrow}>La tua identità fiscale, sicura</Text>
        <Text style={styles.headline}>
          Mai più{"\n"}comunicare a voce{"\n"}
          <Text style={{ color: colors.brandSecondary }}>i tuoi dati fiscali.</Text>
        </Text>
        <Text style={styles.subtitle}>
          Conserva i tuoi dati fiscali una sola volta. Condividili in pochi secondi con un QR privato.
        </Text>

        <View style={styles.actions}>
          <AppButton
            testID="welcome-register-button"
            title="Crea il tuo account"
            onPress={() => router.push("/register")}
          />
          <Pressable
            testID="welcome-login-link"
            style={styles.loginLink}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.loginText}>
              Hai già un account? <Text style={{ color: colors.brandSecondary, fontWeight: "700" }}>Accedi</Text>
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  top: { paddingHorizontal: spacing.xl },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandSecondary },
  brand: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 2.5 },
  bottom: {
    marginTop: "auto",
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  eyebrow: {
    color: colors.brandSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  headline: {
    fontFamily: font.display,
    color: colors.onSurface,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
  },
  subtitle: { ...type.body, marginBottom: spacing.md, maxWidth: 340 },
  actions: { gap: spacing.md, marginTop: spacing.md },
  loginLink: { alignItems: "center", paddingVertical: spacing.sm },
  loginText: { color: colors.onSurfaceSecondary, fontSize: 14 },
});
