import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
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
import { apiListProfiles, apiSetDefaultProfile, apiShareHistory, FiscalProfile } from "../src/api";
import { useToast } from "../src/components/Toast";
import { colors, spacing, type, font } from "../src/theme";

const { width: WIDTH } = Dimensions.get("window");

export default function Dashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user, signOut } = useAuth();
  const toast = useToast();
  const [profiles, setProfiles] = useState<FiscalProfile[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [pr, h] = await Promise.all([
        apiListProfiles(token),
        apiShareHistory(token).catch(() => ({ shares: [] })),
      ]);
      setProfiles(pr.profiles);
      setHistory(h.shares || []);
      // Auto-select default (or first) if no explicit selection or selection is gone
      const currentExists = pr.profiles.find((p) => p.id === selectedId);
      if (!currentExists) {
        const def = pr.profiles.find((p) => p.is_default) || pr.profiles[0];
        setSelectedId(def?.id || null);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, selectedId]);

  useEffect(() => {
    if (!token) router.replace("/welcome");
  }, [token, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const setDefault = async (id: string) => {
    if (!token) return;
    try {
      await apiSetDefaultProfile(token, id);
      toast.show("Identità impostata come default", "success");
      load();
    } catch (e: any) {
      toast.show(e.detail || "Errore", "error");
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandSecondary} />
      </View>
    );
  }

  const selected = profiles.find((p) => p.id === selectedId) || null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.hi}>Ciao</Text>
          <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
        </View>
        <Pressable testID="dashboard-logout" onPress={signOut} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Esci</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandSecondary} />
        }
      >
        <View style={styles.sectionRow}>
          <Text style={styles.sectionLabel}>Le tue identità</Text>
          <Pressable
            testID="dashboard-add-identity"
            onPress={() => router.push("/fiscal-profile/edit")}
          >
            <Text style={styles.linkSmall}>+ Aggiungi</Text>
          </Pressable>
        </View>

        {profiles.length === 0 ? (
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
        ) : (
          <>
            {profiles.length > 1 && (
              <ScrollView
                testID="identity-switcher"
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.switcherRow}
              >
                {profiles.map((p) => (
                  <Pressable
                    key={p.id}
                    testID={`identity-chip-${p.id}`}
                    onPress={() => setSelectedId(p.id!)}
                    onLongPress={() => setDefault(p.id!)}
                    style={[
                      styles.chip,
                      selectedId === p.id && styles.chipActive,
                    ]}
                  >
                    {p.is_default && <View style={styles.chipDefaultDot} />}
                    <Text
                      style={[styles.chipText, selectedId === p.id && styles.chipTextActive]}
                      numberOfLines={1}
                    >
                      {p.label || getDisplayName(p)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {selected && (
              <FiscalIdentityCard
                testID="dashboard-card"
                displayName={getDisplayName(selected)}
                entityLabel={getEntityLabel(selected.entity_type)}
                vatMasked={maskVat(selected.vat_number)}
                onPress={() => router.push({ pathname: "/card", params: { id: selected.id! } })}
              />
            )}

            {profiles.length > 1 && selected && !selected.is_default && (
              <Pressable
                testID="set-default-button"
                onPress={() => setDefault(selected.id!)}
                style={styles.setDefault}
              >
                <Text style={styles.setDefaultText}>Imposta come identità predefinita</Text>
              </Pressable>
            )}

            {selected && (
              <View style={styles.actions}>
                <ActionRow
                  testID="dashboard-share-button"
                  label="Condividi dati fiscali"
                  hint={selected.label || "Genera un QR privato"}
                  onPress={() =>
                    router.push({ pathname: "/share", params: { id: selected.id! } })
                  }
                  primary
                />
                <ActionRow
                  testID="dashboard-view-card"
                  label="Visualizza card"
                  hint="La tua identità completa"
                  onPress={() =>
                    router.push({ pathname: "/card", params: { id: selected.id! } })
                  }
                />
                <ActionRow
                  testID="dashboard-edit-profile"
                  label="Modifica dati"
                  hint={selected.label || "Aggiorna profilo fiscale"}
                  onPress={() =>
                    router.push({
                      pathname: "/fiscal-profile/edit",
                      params: { id: selected.id! },
                    })
                  }
                />
                <ActionRow
                  testID="dashboard-scanner"
                  label="Scansiona QR"
                  hint="Modalità operatore"
                  onPress={() => router.push("/scanner")}
                />
              </View>
            )}
          </>
        )}

        {profiles.length > 0 && (
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
              history.slice(0, 3).map((h) => {
                const labelHint = profiles.find((p) => p.id === h.profile_id)?.label;
                return (
                  <View testID={`history-row-${h.token}`} key={h.token} style={styles.historyRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyDate}>
                        {new Date(h.created_at).toLocaleString("it-IT", {
                          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </Text>
                      <Text style={styles.historySub}>
                        {labelHint ? `${labelHint} · ` : ""}
                        {h.view_count > 0 ? `Visto ${h.view_count}×` : "Non ancora aperto"}
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
                          fontSize: 11, fontWeight: "700",
                        }}
                      >
                        {h.is_active ? "ATTIVO" : "REVOCATO"}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ActionRow({
  label, hint, onPress, testID, primary,
}: { label: string; hint: string; onPress: () => void; testID?: string; primary?: boolean; }) {
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
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingBottom: spacing.lg,
  },
  hi: { color: colors.muted, fontSize: 13 },
  email: { color: colors.onSurface, fontSize: 17, fontWeight: "600", maxWidth: 240 },
  logoutBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logoutText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  content: { paddingBottom: spacing.xxxl, gap: spacing.md },
  sectionLabel: {
    color: colors.muted, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase",
  },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginBottom: spacing.sm,
  },
  linkSmall: { color: colors.brandSecondary, fontSize: 12, fontWeight: "700" },
  switcherRow: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    height: 36,
    borderRadius: 999,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: WIDTH * 0.55,
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  chipDefaultDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandSecondary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.brandSecondary, fontWeight: "700" },
  emptyCard: {
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
    borderRadius: 28, padding: spacing.xl, backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm, aspectRatio: 1.586, justifyContent: "center",
  },
  emptyEyebrow: {
    color: colors.brandSecondary, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.5, textTransform: "uppercase",
  },
  emptyTitle: { fontFamily: font.display, color: colors.onSurface, fontSize: 22, letterSpacing: -0.3 },
  emptyBody: { ...type.body },
  emptyCta: { marginTop: spacing.sm },
  emptyCtaText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 14 },
  setDefault: {
    alignSelf: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  setDefaultText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600" },
  actions: { gap: spacing.sm, marginTop: spacing.md },
  actionRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, padding: spacing.lg,
  },
  actionPrimary: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  actionLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  actionHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  arrow: { color: colors.onSurfaceSecondary, fontSize: 20, fontWeight: "300" },
  historyRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider, gap: spacing.md,
  },
  historyDate: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  historySub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  empty: { color: colors.muted, fontSize: 13, paddingVertical: spacing.md },
});
