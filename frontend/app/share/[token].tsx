import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { AppButton } from "../../src/components/AppButton";
import { useToast } from "../../src/components/Toast";
import { apiPublicShareConfirm, apiPublicShareGet, apiTrackEvent } from "../../src/api";
import { colors, spacing, type, font } from "../../src/theme";

const Row = ({
  label,
  value,
  testID,
  copyable,
  onCopy,
}: {
  label: string;
  value?: string | null;
  testID?: string;
  copyable?: boolean;
  onCopy?: (v: string) => void;
}) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Pressable
      testID={testID}
      onPress={() => value && copyable && onCopy && onCopy(value)}
      style={{ flex: 1.4, flexShrink: 1, alignItems: "flex-end" }}
    >
      <Text style={styles.rowValue} numberOfLines={2}>
        {value || "—"}
      </Text>
      {copyable && value && <Text style={styles.copyHint}>Tocca per copiare</Text>}
    </Pressable>
  </View>
);

export default function PublicShare() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await apiPublicShareGet(token);
      setProfile(r.profile);
      setConfirmed(r.confirmed_at);
      apiTrackEvent("share_opened", { token });
    } catch (e: any) {
      setError(e.detail || "Condivisione non valida o scaduta");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onCopy = async (v: string) => {
    await Clipboard.setStringAsync(v);
    toast.show("Copiato", "success");
  };

  const onCopyAll = async () => {
    if (!profile) return;
    const lines = [
      profile.entity_type === "company"
        ? `Ragione sociale: ${profile.business_name || ""}`
        : `Nome: ${(profile.first_name || "")} ${(profile.last_name || "")}`,
      profile.vat_number ? `P.IVA: ${profile.vat_number}` : "",
      profile.tax_code ? `C.F.: ${profile.tax_code}` : "",
      `Indirizzo: ${profile.address}${profile.street_number ? ", " + profile.street_number : ""}`,
      `${profile.postal_code} ${profile.city} (${profile.province}) ${profile.country || ""}`,
      profile.recipient_code ? `Cod. Destinatario: ${profile.recipient_code}` : "",
      profile.pec ? `PEC: ${profile.pec}` : "",
      `Email: ${profile.contact_email}`,
    ].filter(Boolean).join("\n");
    await Clipboard.setStringAsync(lines);
    toast.show("Tutti i dati copiati", "success");
  };

  const onConfirm = async () => {
    if (!token) return;
    setConfirming(true);
    try {
      const r = await apiPublicShareConfirm(token);
      setConfirmed(r.confirmed_at);
      toast.show("Acquisizione confermata", "success");
    } catch (e: any) {
      toast.show(e.detail || "Errore conferma", "error");
    } finally {
      setConfirming(false);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>;
  }

  if (error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.errorBox} testID="share-error">
          <Text style={styles.errorEyebrow}>Accesso negato</Text>
          <Text style={styles.errorTitle}>Condivisione non valida</Text>
          <Text style={styles.errorBody}>
            Il link o il QR non è più valido. Chiedi al cliente di generare una nuova condivisione.
          </Text>
        </View>
      </View>
    );
  }

  const displayName =
    profile.entity_type === "company"
      ? profile.business_name || "—"
      : [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—";

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>FiskID</Text>
        </View>
        {Platform.OS === "web" ? null : (
          <Pressable testID="share-back" onPress={() => router.back()}>
            <Text style={styles.backText}>‹ Indietro</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.xl,
          paddingBottom: insets.bottom + 120,
          gap: spacing.lg,
        }}
      >
        <Text style={styles.eyebrow}>Dati fiscali · condivisione sicura</Text>
        <Text style={styles.title} testID="share-name">{displayName}</Text>

        <Pressable
          testID="share-copy-all"
          onPress={onCopyAll}
          style={styles.copyAll}
        >
          <Text style={styles.copyAllText}>Copia tutti i dati</Text>
        </Pressable>

        <View style={styles.box}>
          <Text style={styles.section}>Anagrafica</Text>
          {profile.entity_type === "company" ? (
            <Row label="Ragione sociale" value={profile.business_name} testID="share-business-name" copyable onCopy={onCopy} />
          ) : (
            <>
              <Row label="Nome" value={profile.first_name} testID="share-first-name" copyable onCopy={onCopy} />
              <Row label="Cognome" value={profile.last_name} testID="share-last-name" copyable onCopy={onCopy} />
            </>
          )}
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Dati fiscali</Text>
          <Row label="Partita IVA" value={profile.vat_number} testID="share-vat" copyable onCopy={onCopy} />
          <Row label="Codice fiscale" value={profile.tax_code} testID="share-cf" copyable onCopy={onCopy} />
          <Row label="Codice destinatario" value={profile.recipient_code} testID="share-recipient" copyable onCopy={onCopy} />
          <Row label="PEC" value={profile.pec} testID="share-pec" copyable onCopy={onCopy} />
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Indirizzo</Text>
          <Row label="Indirizzo" value={[profile.address, profile.street_number].filter(Boolean).join(", ")} testID="share-address" copyable onCopy={onCopy} />
          <Row label="CAP" value={profile.postal_code} testID="share-cap" copyable onCopy={onCopy} />
          <Row label="Città" value={profile.city} testID="share-city" copyable onCopy={onCopy} />
          <Row label="Provincia" value={profile.province} testID="share-province" copyable onCopy={onCopy} />
          <Row label="Paese" value={profile.country} testID="share-country" />
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Contatti</Text>
          <Row label="Email" value={profile.contact_email} testID="share-email" copyable onCopy={onCopy} />
          <Row label="Telefono" value={profile.contact_phone} testID="share-phone" copyable onCopy={onCopy} />
        </View>

        <Text style={styles.disclaimer}>
          I dati sono stati condivisi in modo privato dal titolare tramite FiskID. Il link è protetto da token e può essere revocato in qualsiasi momento.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        {confirmed ? (
          <View style={styles.confirmed} testID="share-confirmed">
            <View style={styles.confirmedDot} />
            <View>
              <Text style={styles.confirmedTitle}>Acquisizione confermata</Text>
              <Text style={styles.confirmedSub}>
                {new Date(confirmed).toLocaleString("it-IT")}
              </Text>
            </View>
          </View>
        ) : (
          <AppButton
            testID="share-confirm-button"
            title="Conferma acquisizione dati"
            onPress={onConfirm}
            loading={confirming}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brandSecondary },
  brand: { color: colors.onSurface, fontSize: 14, fontWeight: "700", letterSpacing: 2 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 14 },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 32, marginBottom: spacing.sm, letterSpacing: -0.5 },
  copyAll: {
    alignSelf: "flex-start",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
  },
  copyAllText: { color: colors.brandSecondary, fontSize: 13, fontWeight: "700" },
  box: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: spacing.lg,
  },
  section: {
    color: colors.brandSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  rowLabel: { ...type.small, color: colors.muted, flex: 1 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600", textAlign: "right" },
  copyHint: { color: colors.muted, fontSize: 10, marginTop: 2 },
  disclaimer: { ...type.small, color: colors.muted, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(5,5,5,0.96)",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  confirmed: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1,
    borderColor: colors.brandSecondary,
    borderRadius: 16,
    padding: spacing.lg,
  },
  confirmedDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brandSecondary },
  confirmedTitle: { color: colors.brandSecondary, fontSize: 14, fontWeight: "700" },
  confirmedSub: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  errorBox: {
    margin: spacing.xl,
    padding: spacing.xl,
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    gap: spacing.sm,
  },
  errorEyebrow: { color: colors.error, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  errorTitle: { fontFamily: font.display, color: colors.onSurface, fontSize: 22 },
  errorBody: { ...type.body, textAlign: "center" },
});
