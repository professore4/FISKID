import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { AppButton } from "../src/components/AppButton";
import { useToast } from "../src/components/Toast";
import { apiCreateShare, APP_BASE_URL, apiTrackEvent } from "../src/api";
import { useAuth } from "../src/auth";
import { colors, spacing, type, font } from "../src/theme";

export default function Share() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { token } = useAuth();
  const toast = useToast();
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [profileLabel, setProfileLabel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const generate = useCallback(async () => {
    if (!token) return;
    setCreating(true);
    try {
      const r = await apiCreateShare(token, id);
      setShareToken(r.token);
      setProfileLabel(r.profile_label);
      apiTrackEvent("share_created", { profile_id: r.profile_id });
    } catch (e: any) {
      toast.show(e.detail || "Errore generazione", "error");
    } finally {
      setCreating(false);
    }
  }, [token, id, toast]);

  useEffect(() => {
    generate();
  }, [generate]);

  const url = shareToken ? `${APP_BASE_URL}/share/${shareToken}` : "";

  const copyLink = async () => {
    if (!url) return;
    await Clipboard.setStringAsync(url);
    toast.show("Link copiato", "success");
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable testID="share-close" onPress={() => router.back()} style={{ padding: spacing.sm }}>
          <Text style={styles.backText}>✕  Chiudi</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Condividi i tuoi dati</Text>
        <View style={{ width: 90 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.eyebrow}>PRIVACY GARANTITA</Text>
        <Text style={styles.title}>Mostra questo QR</Text>
        <Text style={styles.body}>
          L'operatore lo scansiona e riceve solo i dati necessari alla fattura. Nessun dato viene pronunciato.
        </Text>
        {profileLabel ? (
          <View testID="share-profile-badge" style={styles.profileBadge}>
            <View style={styles.brandDot} />
            <Text style={styles.profileBadgeText}>Identità: {profileLabel}</Text>
          </View>
        ) : null}

        <View testID="qr-card" style={styles.qrCard}>
          {creating || !shareToken ? (
            <ActivityIndicator color={colors.brand} size="large" />
          ) : (
            <QRCode
              value={url}
              size={240}
              backgroundColor={colors.surfaceInverse}
              color={colors.onSurfaceInverse}
            />
          )}
          {shareToken && (
            <View style={styles.qrFooter}>
              <View style={styles.brandDot} />
              <Text style={styles.qrFooterText}>FiskID · Identità fiscale</Text>
            </View>
          )}
        </View>

        {shareToken && (
          <Text style={styles.tokenHint} numberOfLines={1} testID="share-url">
            {url}
          </Text>
        )}

        <View style={styles.actions}>
          <AppButton
            testID="share-copy-link"
            title="Copia link"
            variant="secondary"
            onPress={copyLink}
            disabled={!shareToken}
          />
          <AppButton
            testID="share-new-token"
            title="Genera nuovo QR"
            variant="ghost"
            onPress={generate}
            loading={creating}
          />
        </View>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Text style={styles.footerText}>Il token è casuale e non contiene nessun tuo dato personale.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  content: { flex: 1, paddingHorizontal: spacing.xl, alignItems: "center", justifyContent: "center", gap: spacing.md },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 30, textAlign: "center" },
  body: { ...type.body, textAlign: "center", maxWidth: 320, marginBottom: spacing.lg },
  qrCard: {
    backgroundColor: colors.surfaceInverse,
    padding: spacing.xl,
    borderRadius: 24,
    alignItems: "center",
    gap: spacing.md,
    shadowColor: colors.brandSecondary,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 40,
    shadowOpacity: 0.3,
    ...(Platform.OS === "web" ? { boxShadow: "0 0 40px rgba(16,185,129,0.3)" as any } : {}),
  },
  qrFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.1)",
    paddingTop: spacing.md,
    width: "100%",
    justifyContent: "center",
  },
  brandDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand },
  qrFooterText: { color: colors.onSurfaceInverse, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  profileBadge: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 999,
    backgroundColor: colors.brandTertiary,
    borderWidth: 1, borderColor: colors.brandSecondary,
    alignSelf: "center",
  },
  profileBadgeText: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  tokenHint: {
    color: colors.muted,
    fontSize: 11,
    marginTop: spacing.sm,
    maxWidth: 320,
    textAlign: "center",
  },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg, alignSelf: "stretch" },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  footerText: { color: colors.muted, fontSize: 12, textAlign: "center" },
});
