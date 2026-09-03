import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../src/components/AppButton";
import {
  FiscalIdentityCard,
  getDisplayName,
  getEntityLabel,
  maskVat,
} from "../src/components/FiscalIdentityCard";
import { apiGetProfile, FiscalProfile } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, spacing, type } from "../src/theme";

const Row = ({ label, value }: { label: string; value?: string | null }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue} numberOfLines={2}>
      {value || "—"}
    </Text>
  </View>
);

export default function Card() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [profile, setProfile] = useState<FiscalProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiGetProfile(token);
      setProfile(r.profile);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>;
  }

  if (!profile) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <Text style={{ color: colors.onSurface, fontSize: 18 }}>Nessun profilo</Text>
        <AppButton title="Crea profilo" onPress={() => router.replace("/fiscal-profile/edit")} style={{ marginTop: spacing.lg }} />
      </View>
    );
  }

  const fullAddress = [profile.address, profile.street_number].filter(Boolean).join(", ");

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable testID="card-back" onPress={() => router.back()} style={{ padding: spacing.sm }}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Fiscal Identity Card</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 120, gap: spacing.lg }}
      >
        <FiscalIdentityCard
          testID="card-hero"
          displayName={getDisplayName(profile)}
          entityLabel={getEntityLabel(profile.entity_type)}
          vatMasked={maskVat(profile.vat_number)}
        />

        <View style={styles.detailBox}>
          <Text style={styles.section}>Anagrafica</Text>
          {profile.entity_type === "company" ? (
            <Row label="Ragione sociale" value={profile.business_name} />
          ) : (
            <>
              <Row label="Nome" value={profile.first_name} />
              <Row label="Cognome" value={profile.last_name} />
            </>
          )}
          <Row label="Tipo soggetto" value={getEntityLabel(profile.entity_type)} />
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.section}>Dati fiscali</Text>
          <Row label="Partita IVA" value={profile.vat_number} />
          <Row label="Codice fiscale" value={profile.tax_code} />
          <Row label="Codice destinatario" value={profile.recipient_code} />
          <Row label="PEC" value={profile.pec} />
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.section}>Indirizzo</Text>
          <Row label="Via" value={fullAddress} />
          <Row label="CAP" value={profile.postal_code} />
          <Row label="Città" value={profile.city} />
          <Row label="Provincia" value={profile.province} />
          <Row label="Paese" value={profile.country} />
        </View>

        <View style={styles.detailBox}>
          <Text style={styles.section}>Contatti</Text>
          <Row label="Email" value={profile.contact_email} />
          <Row label="Telefono" value={profile.contact_phone} />
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="card-share-button"
          title="Condividi dati fiscali"
          onPress={() => router.push("/share")}
        />
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
  headerTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  detailBox: {
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
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
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  rowLabel: { ...type.small, color: colors.muted, flex: 1 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600", textAlign: "right", flex: 1.4, flexShrink: 1 },
  footer: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(5,5,5,0.95)",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
