import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Linking } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../src/components/AppButton";
import {
  FiscalIdentityCard,
  getDisplayName,
  getEntityLabel,
  maskVat,
} from "../src/components/FiscalIdentityCard";
import { useToast } from "../src/components/Toast";
import {
  apiGetDefaultProfile,
  apiGetProfile,
  apiWalletTokens,
  FiscalProfile,
  walletFullUrl,
} from "../src/api";
import { useAuth } from "../src/auth";
import { colors, spacing, type } from "../src/theme";

const Row = ({ label, value }: { label: string; value?: string | null }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={styles.rowValue} numberOfLines={2}>{value || "—"}</Text>
  </View>
);

export default function Card() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<FiscalProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [walletLoading, setWalletLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      if (id) {
        const r = await apiGetProfile(token, id);
        setProfile(r.profile);
      } else {
        const r = await apiGetDefaultProfile(token);
        setProfile(r.profile);
      }
    } catch (e: any) {
      toast.show(e.detail || "Errore caricamento", "error");
    } finally {
      setLoading(false);
    }
  }, [token, id, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openWallet = async (kind: "apple" | "google") => {
    if (!profile?.id || !token) return;
    setWalletLoading(true);
    try {
      const r = await apiWalletTokens(token, profile.id);
      const url = walletFullUrl(kind === "apple" ? r.apple_url : r.google_url);
      const supported = await Linking.canOpenURL(url).catch(() => true);
      if (!supported) throw new Error("Non è possibile aprire il link su questo dispositivo.");
      await Linking.openURL(url);
      toast.show(
        kind === "apple"
          ? "Apple Wallet: pass MVP non firmato (serve certificato Apple)"
          : "Google Wallet: link generato (serve service account Google)",
        "info",
      );
    } catch (e: any) {
      toast.show(e.detail || e.message || "Errore Wallet", "error");
    } finally {
      setWalletLoading(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>;

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
        <Pressable testID="card-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/dashboard"))} style={{ padding: spacing.sm }}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{profile.label || "Fiscal Identity Card"}</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 120, gap: spacing.lg }}>
        <FiscalIdentityCard
          testID="card-hero"
          displayName={getDisplayName(profile)}
          entityLabel={getEntityLabel(profile.entity_type)}
          vatMasked={maskVat(profile.vat_number)}
        />

        {profile.is_delegate ? (
          <View style={styles.delegateBanner} testID="card-delegate-banner">
            <View style={styles.delegateBannerDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.delegateBannerTitle}>Delega attiva</Text>
              <Text style={styles.delegateBannerBody}>
                di {profile.admin_email} · {(profile.permissions || []).join(" + ") || "nessun permesso"}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.walletRow}>
            <Pressable
              testID="add-apple-wallet"
              onPress={() => openWallet("apple")}
              disabled={walletLoading}
              style={[styles.walletBtn, { backgroundColor: "#000", borderColor: "#333" }]}
            >
              <Text style={styles.walletBtnText}>  Aggiungi a Apple Wallet</Text>
            </Pressable>
            <Pressable
              testID="add-google-wallet"
              onPress={() => openWallet("google")}
              disabled={walletLoading}
              style={[styles.walletBtn, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <Text style={styles.walletBtnText}>G  Aggiungi a Google Wallet</Text>
            </Pressable>
          </View>
        )}

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
          onPress={() => router.push({ pathname: "/share", params: { id: profile.id! } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.5, flex: 1, textAlign: "center" },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  walletRow: { flexDirection: "row", gap: spacing.sm },
  walletBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  walletBtnText: { color: colors.onSurface, fontSize: 13, fontWeight: "700" },
  delegateBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: 14,
    backgroundColor: "rgba(217, 119, 6, 0.1)",
    borderWidth: 1, borderColor: "rgba(217, 119, 6, 0.4)",
  },
  delegateBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  delegateBannerTitle: { color: colors.warning, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  delegateBannerBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },
  detailBox: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 20,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  section: {
    color: colors.brandSecondary, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.divider, gap: spacing.md,
  },
  rowLabel: { ...type.small, color: colors.muted, flex: 1 },
  rowValue: { color: colors.onSurface, fontSize: 14, fontWeight: "600", textAlign: "right", flex: 1.4, flexShrink: 1 },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    padding: spacing.lg, backgroundColor: "rgba(5,5,5,0.95)",
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
});
