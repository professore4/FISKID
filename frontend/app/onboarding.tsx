import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../src/components/AppButton";
import { colors, spacing, type, font } from "../src/theme";
import { apiTrackEvent } from "../src/api";

const steps = [
  {
    eyebrow: "Privacy",
    title: "Mai più a voce.",
    body:
      "I tuoi dati fiscali non devono più essere pronunciati ad alta voce davanti ad altri. FiskID li conserva e li condivide privatamente.",
  },
  {
    eyebrow: "Una volta sola",
    title: "Compila una volta,\ncondividi sempre.",
    body:
      "Inserisci partita IVA, codice fiscale, PEC e indirizzo una sola volta. Poi li avrai sempre pronti nella tua Fiscal Identity Card.",
  },
  {
    eyebrow: "Veloce",
    title: "Un QR e sei a posto.",
    body:
      "Quando ti serve una fattura, mostra il QR. L'operatore acquisisce i dati corretti in pochi secondi.",
  },
];

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const current = steps[step];

  useEffect(() => {
    apiTrackEvent("onboarding_viewed", { step });
  }, [step]);

  const onNext = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else {
      apiTrackEvent("fiscal_profile_started");
      router.replace("/fiscal-profile/edit");
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
      <View style={styles.progressRow}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[styles.progressBar, i === step && styles.progressActive]}
          />
        ))}
      </View>

      <Pressable
        testID="onboarding-skip"
        onPress={() => router.replace("/fiscal-profile/edit")}
        style={styles.skip}
      >
        <Text style={styles.skipText}>Salta</Text>
      </Pressable>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>{current.eyebrow}</Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <AppButton
          testID="onboarding-next-button"
          title={step < steps.length - 1 ? "Continua" : "Crea la mia identità"}
          onPress={onNext}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  progressRow: { flexDirection: "row", gap: spacing.xs, marginTop: spacing.md },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.surfaceTertiary,
  },
  progressActive: { backgroundColor: colors.brandSecondary },
  skip: { position: "absolute", right: spacing.xl, top: 60, padding: spacing.sm },
  skipText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  content: { flexGrow: 1, justifyContent: "center", gap: spacing.md, paddingVertical: spacing.xxxl },
  eyebrow: {
    color: colors.brandSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: font.display,
    color: colors.onSurface,
    fontSize: 40,
    lineHeight: 46,
    letterSpacing: -0.5,
    marginBottom: spacing.md,
  },
  body: { ...type.body, fontSize: 16, lineHeight: 24, maxWidth: 340 },
  footer: { gap: spacing.md, marginTop: spacing.md },
});
