import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, Switch, ScrollView } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { useToast } from "../src/components/Toast";
import { bioLock, pinLock, rememberedIdentifier } from "../src/lock";
import { colors, spacing, type, font } from "../src/theme";

export default function Settings() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { token, loading, user, signOut, refreshLockState, requireLock } = useAuth();

  const [hasPin, setHasPin] = useState(false);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [remembered, setRemembered] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !token) router.replace("/welcome");
  }, [loading, token, router]);

  const load = useCallback(async () => {
    setHasPin(await pinLock.isEnabled());
    setBioSupported(await bioLock.hardwareSupported());
    setBioOn(await bioLock.isEnabled());
    setRemembered(await rememberedIdentifier.get());
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const changePin = () => router.push("/set-pin");

  const disablePin = async () => {
    await pinLock.clear();
    await refreshLockState();
    toast.show("Protezione PIN disattivata", "success");
    load();
  };

  const toggleBio = async (v: boolean) => {
    if (v && !hasPin) {
      toast.show("Imposta prima un PIN", "info");
      return;
    }
    if (v) {
      const ok = await bioLock.authenticate("Conferma biometria");
      if (!ok) {
        toast.show("Autenticazione biometrica non riuscita", "error");
        return;
      }
    }
    await bioLock.setEnabled(v);
    setBioOn(v);
    toast.show(v ? "Biometria attivata" : "Biometria disattivata", "success");
  };

  const clearRemembered = async () => {
    await rememberedIdentifier.clear();
    setRemembered(null);
    toast.show("Identificativo dimenticato", "success");
  };

  const lockNow = () => {
    requireLock();
    router.replace("/lock");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable
          testID="settings-back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/dashboard"))}
          style={{ padding: spacing.sm }}
        >
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Impostazioni</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}>
        <View>
          <Text style={styles.section}>Account</Text>
          <View style={styles.rowStatic}>
            <Text style={styles.label}>Email</Text>
            <Text style={styles.value} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Sicurezza</Text>

          <ActionRow
            testID="settings-change-pin"
            label={hasPin ? "Modifica PIN" : "Imposta un PIN"}
            hint={hasPin ? "6 cifre attive" : "Proteggi l'accesso all'app"}
            onPress={changePin}
          />
          {hasPin && (
            <ActionRow
              testID="settings-disable-pin"
              label="Disattiva PIN"
              hint="Rimuovi la protezione a 6 cifre"
              onPress={disablePin}
              danger
            />
          )}

          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Sblocco biometrico</Text>
              <Text style={styles.toggleHint}>
                {bioSupported
                  ? "Face ID / Touch ID · richiede un PIN attivo"
                  : "Non disponibile su questo dispositivo"}
              </Text>
            </View>
            <Switch
              testID="settings-bio-toggle"
              value={bioOn}
              disabled={!bioSupported || !hasPin}
              onValueChange={toggleBio}
              trackColor={{ true: colors.brandSecondary, false: colors.border }}
              thumbColor={colors.onSurface}
            />
          </View>

          {hasPin && (
            <ActionRow
              testID="settings-lock-now"
              label="Blocca ora"
              hint="Richiedi il PIN al prossimo accesso"
              onPress={lockNow}
            />
          )}
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Login</Text>
          <View style={styles.rowStatic}>
            <Text style={styles.label}>Ricordami</Text>
            <Text style={styles.value} numberOfLines={1}>
              {remembered ? remembered : "Nessun identificativo salvato"}
            </Text>
          </View>
          {remembered && (
            <ActionRow
              testID="settings-clear-remembered"
              label="Dimentica identificativo"
              hint="Rimuovi email/P.IVA/CF salvati"
              onPress={clearRemembered}
              danger
            />
          )}
        </View>

        <ActionRow
          testID="settings-signout"
          label="Esci"
          hint="Termina questa sessione"
          onPress={signOut}
          danger
        />
      </ScrollView>
    </View>
  );
}

function ActionRow({
  label, hint, onPress, danger, testID,
}: { label: string; hint: string; onPress: () => void; danger?: boolean; testID?: string; }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && { opacity: 0.8 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, danger && { color: colors.error }]}>{label}</Text>
        <Text style={styles.actionHint}>{hint}</Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  box: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 20,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  section: {
    color: colors.brandSecondary, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  rowStatic: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  value: { color: colors.onSurface, fontSize: 15, fontWeight: "500", marginTop: 4 },
  actionRow: {
    flexDirection: "row", alignItems: "center",
    padding: spacing.md, borderRadius: 12,
  },
  actionLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  actionHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  arrow: { color: colors.onSurfaceSecondary, fontSize: 20, fontWeight: "300" },
  toggleRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    padding: spacing.md, borderRadius: 12,
  },
  toggleLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  toggleHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
