import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import {
  FiscalIdentityCard,
  getDisplayName,
  getEntityLabel,
  maskVat,
} from "../src/components/FiscalIdentityCard";
import { apiGetProfile, apiShareHistory, FiscalProfile } from "../src/api";
import { colors, spacing, type, font } from "../src/theme";

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, signOut } = useAuth();
  const [profile, setProfile] = useState<FiscalProfile | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [p, h] = await Promise.all([
        apiGetProfile(token),
        apiShareHistory(token).catch(() => ({ shares: [] })),
      ]);
      setProfile(p.profile);
      setHistory(h.shares || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) router.replace("/welcome");
  }, [token, router]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandSecondary} />
      </View>
    );
  }

  const displayName = getDisplayName(profile);
  const entityLabel = getEntityLabel(profile?.entity_type);
  const vatMasked = maskVat(profile?.vat_number);

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Ciao</Text>
          <Text style={styles.email} numberOfLines={1}>
            {user?.email}
          </Text>
        </View>
        <Pressable testID="dashboard-logout" onPress={signOut} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Esci</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandSecondary} />}
      >
        <Text style={styles.sectionLabel}>Il tuo profilo fiscale</Text>

        {profile ? (
          <FiscalIdentityCard
            testID="dashboard-card"
            displayName={displayName}
            entityLabel={entityLabel}
            vatMasked={vatMasked}
            onPress={() => router.push("/card")}
          />
        ) : (
          <Pressable
            testID="dashboard-empty-card"
            onPress={() => router.push("/fiscal-profile/edit")}
            style={styles.emptyCard}
          >
            <Text style={styles.emptyEyebrow}>Nessuna identità</Text>
            <Text style={styles.emptyTitle}>Crea la tua Fiscal Identity Card</Text>
            <Text style={styles.emptyBody}>
              Compila i tuoi dati fiscali per iniziare a condividerli in sicurezza.
            </Text>
            <View style={styles.emptyCta}>
              <Text style={styles.emptyCtaText}>Inizia →</Text>
            </View>
          </Pressable>
        )}

        {profile && (
          <View style={styles.actions}>
            <ActionRow
              testID="dashboard-share-button"
              label="Condividi dati fiscali"
              hint="Genera un QR privato"
              onPress={() => router.push("/share")}
              primary
            />
            <ActionRow
              testID="dashboard-view-card"
              label="Visualizza card"
              hint="La tua identità"
              onPress={() => router.push("/card")}
            />
            <ActionRow
              testID="dashboard-edit-profile"
              label="Modifica dati"
              hint="Aggiorna profilo fiscale"
              onPress={() => router.push("/fiscal-profile/edit")}
            />
            <ActionRow
              testID="dashboard-scanner"
              label="Scansiona QR"
              hint="Modalità operatore"
              onPress={() => router.push("/scanner")}
            />
          </View>
        )}

        {profile && (
          <View style={{ marginTop: spacing.xl }}>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Ultime condivisioni</Text>
              {history.length > 0 && (
                <Pressable testID="dashboard-history-link" onPress={() => router.push("/history")}>
                  <Text style={styles.linkSmall}>Tutte →</Text>
                </Pressable>
              )}
            </View>
            {history.length === 0 ? (
              <Text style={styles.empty}>Nessuna condivisione ancora.</Text>
            ) : (
              history.slice(0, 3).map((h) => (
                <View testID={`history-row-${h.token}`} key={h.token} style={styles.historyRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.historyDate}>
                      {new Date(h.created_at).toLocaleString("it-IT", {
                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                      })}
                    </Text>
                    <Text style={styles.historySub}>
                      {h.view_count > 0 ? `Visto ${h.view_count} volte` : "Non ancora aperto"}
                      {h.confirmed_at ? " · Confermato" : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.pill,
                      { backgroundColor: h.is_active ? "rgba(16,185,129,0.15)" : colors.surfaceTertiary },
                    ]}
                  >
                    <Text
                      style={{
                        color: h.is_active ? colors.brandSecondary : colors.muted,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {h.is_active ? "ATTIVO" : "REVOCATO"}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ActionRow({
  label,
  hint,
  onPress,
  testID,
  primary,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  testID?: string;
  primary?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        primary && styles.actionPrimary,
        pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.actionLabel, primary && { color: colors.onBrandPrimary }]}>{label}</Text>
        <Text style={[styles.actionHint, primary && { color: "rgba(255,255,255,0.75)" }]}>{hint}</Text>
      </View>
      <Text style={[styles.arrow, primary && { color: colors.onBrandPrimary }]}>→</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: spacing.xl },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: spacing.lg,
  },
  hi: { color: colors.muted, fontSize: 13 },
  email: { color: colors.onSurface, fontSize: 17, fontWeight: "600", maxWidth: 240 },
  logoutBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logoutText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  content: { paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  linkSmall: { color: colors.brandSecondary, fontSize: 12, fontWeight: "700" },
  emptyCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    borderRadius: 28,
    padding: spacing.xl,
    backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm,
    aspectRatio: 1.586,
    justifyContent: "center",
  },
  emptyEyebrow: {
    color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase",
  },
  emptyTitle: { fontFamily: font.display, color: colors.onSurface, fontSize: 22, letterSpacing: -0.3 },
  emptyBody: { ...type.body },
  emptyCta: { marginTop: spacing.sm },
  emptyCtaText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 14 },
  actions: { gap: spacing.sm, marginTop: spacing.lg },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: spacing.lg,
  },
  actionPrimary: {
    backgroundColor: colors.brandPrimary,
    borderColor: colors.brandPrimary,
  },
  actionLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  actionHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  arrow: { color: colors.onSurfaceSecondary, fontSize: 20, fontWeight: "300" },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  historyDate: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  historySub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.md },
});
