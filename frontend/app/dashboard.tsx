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
type Mode = "sending" | "receiving";

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
  const [mode, setMode] = useState<Mode>("sending");

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const [pr, h] = await Promise.all([
        apiListProfiles(token),
        apiShareHistory(token).catch(() => ({ shares: [] })),
      ]);
      setProfiles(pr.profiles);
      setHistory(h.shares || []);
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

  const onRefresh = () => { setRefreshing(true); load(); };

  const setDefault = async (id: string) => {
    if (!token) return;
    try {
      await apiSetDefaultProfile(token, id);
      toast.show("Identità impostata come predefinita", "success");
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
  const isDelegate = !!selected?.is_delegate;
  const canSend = !isDelegate || (selected?.permissions?.includes("send") ?? false);
  const canReceive = !isDelegate || (selected?.permissions?.includes("receive") ?? false);
  const isCompany = selected?.entity_type === "company";
  const isOwnCompany = isCompany && !isDelegate;

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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandSecondary} />}
      >
        {/* Mode toggle */}
        <View style={styles.modeRow}>
          <Pressable
            testID="mode-sending"
            onPress={() => setMode("sending")}
            style={[styles.modeBtn, mode === "sending" && styles.modeBtnActive]}
          >
            <Text style={[styles.modeIcon, mode === "sending" && { color: colors.onBrandPrimary }]}>↑</Text>
            <Text style={[styles.modeLabel, mode === "sending" && styles.modeLabelActive]}>Sto pagando</Text>
            <Text style={[styles.modeHint, mode === "sending" && { color: "rgba(255,255,255,0.75)" }]}>Mostra il tuo QR</Text>
          </Pressable>
          <Pressable
            testID="mode-receiving"
            onPress={() => setMode("receiving")}
            style={[styles.modeBtn, mode === "receiving" && styles.modeBtnActive]}
          >
            <Text style={[styles.modeIcon, mode === "receiving" && { color: colors.onBrandPrimary }]}>↓</Text>
            <Text style={[styles.modeLabel, mode === "receiving" && styles.modeLabelActive]}>Sto incassando</Text>
            <Text style={[styles.modeHint, mode === "receiving" && { color: "rgba(255,255,255,0.75)" }]}>Scansiona il QR</Text>
          </Pressable>
        </View>

        {mode === "receiving" ? (
          <View style={styles.receivingBox} testID="receiving-panel">
            <Text style={styles.receivingEyebrow}>MODALITÀ OPERATORE</Text>
            <Text style={styles.receivingTitle}>Ricevi i dati fiscali del cliente</Text>
            <Text style={styles.receivingBody}>
              Apri lo scanner e inquadra il QR FiskID: i dati arrivano puliti,
              pronti per la tua fattura.
            </Text>
            <Pressable
              testID="open-scanner-button"
              onPress={() => router.push("/scanner")}
              style={styles.scanBtn}
            >
              <Text style={styles.scanBtnText}>Apri scanner</Text>
            </Pressable>
            {isDelegate && !canReceive && (
              <Text style={styles.warn}>
                Come delegato hai solo il permesso di invio: chiedi all'amministratore l'accesso ricezione.
              </Text>
            )}
          </View>
        ) : (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.sectionLabel}>Le tue identità</Text>
              <Pressable testID="dashboard-add-identity" onPress={() => router.push("/fiscal-profile/edit")}>
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
                <Text style={styles.emptyBody}>Compila i tuoi dati fiscali per iniziare.</Text>
                <View style={styles.emptyCta}><Text style={styles.emptyCtaText}>Inizia →</Text></View>
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
                        onLongPress={() => !p.is_delegate && setDefault(p.id!)}
                        style={[
                          styles.chip,
                          selectedId === p.id && styles.chipActive,
                          p.is_delegate && styles.chipDelegate,
                        ]}
                      >
                        {p.is_default && <View style={styles.chipDefaultDot} />}
                        {p.is_delegate && <View style={styles.chipDelegateBadge}><Text style={styles.chipDelegateBadgeText}>DEL</Text></View>}
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
                  <>
                    <FiscalIdentityCard
                      testID="dashboard-card"
                      displayName={getDisplayName(selected)}
                      entityLabel={getEntityLabel(selected.entity_type)}
                      vatMasked={maskVat(selected.vat_number)}
                      onPress={() => router.push({ pathname: "/card", params: { id: selected.id! } })}
                    />

                    {isDelegate && (
                      <View style={styles.delegateBanner} testID="delegate-banner">
                        <View style={styles.delegateBannerDot} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.delegateBannerTitle}>Sei delegato</Text>
                          <Text style={styles.delegateBannerBody}>
                            di {selected.admin_email} · {(selected.permissions || []).join(" + ") || "nessun permesso"}
                          </Text>
                        </View>
                      </View>
                    )}

                    {!isDelegate && profiles.length > 1 && !selected.is_default && (
                      <Pressable
                        testID="set-default-button"
                        onPress={() => setDefault(selected.id!)}
                        style={styles.setDefault}
                      >
                        <Text style={styles.setDefaultText}>Imposta come identità predefinita</Text>
                      </Pressable>
                    )}
                  </>
                )}

                {selected && (
                  <View style={styles.actions}>
                    <ActionRow
                      testID="dashboard-share-button"
                      label="Condividi dati fiscali"
                      hint={
                        !canSend
                          ? "Permesso di invio non concesso"
                          : (selected.label || "Genera un QR privato")
                      }
                      onPress={() =>
                        canSend &&
                        router.push({ pathname: "/share", params: { id: selected.id! } })
                      }
                      primary
                      disabled={!canSend}
                    />
                    <ActionRow
                      testID="dashboard-view-card"
                      label="Visualizza card"
                      hint="La tua identità completa"
                      onPress={() => router.push({ pathname: "/card", params: { id: selected.id! } })}
                    />
                    {!isDelegate && (
                      <ActionRow
                        testID="dashboard-edit-profile"
                        label="Modifica dati"
                        hint={selected.label || "Aggiorna profilo fiscale"}
                        onPress={() =>
                          router.push({ pathname: "/fiscal-profile/edit", params: { id: selected.id! } })
                        }
                      />
                    )}
                    {isOwnCompany && (
                      <ActionRow
                        testID="dashboard-delegates-button"
                        label="Delegati"
                        hint="Gestisci chi può usare questa identità"
                        onPress={() =>
                          router.push({ pathname: "/delegates/[profileId]", params: { profileId: selected.id! } })
                        }
                      />
                    )}
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
                        <View style={[styles.pill, { backgroundColor: h.is_active ? "rgba(16,185,129,0.15)" : colors.surfaceTertiary }]}>
                          <Text style={{ color: h.is_active ? colors.brandSecondary : colors.muted, fontSize: 11, fontWeight: "700" }}>
                            {h.is_active ? "ATTIVO" : "REVOCATO"}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function ActionRow({
  label, hint, onPress, testID, primary, disabled,
}: { label: string; hint: string; onPress: () => void; testID?: string; primary?: boolean; disabled?: boolean; }) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionRow,
        primary && styles.actionPrimary,
        disabled && { opacity: 0.4 },
        pressed && !disabled && { opacity: 0.85, transform: [{ scale: 0.99 }] },
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
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: spacing.lg },
  hi: { color: colors.muted, fontSize: 13 },
  email: { color: colors.onSurface, fontSize: 17, fontWeight: "600", maxWidth: 240 },
  logoutBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  logoutText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  content: { paddingBottom: spacing.xxxl, gap: spacing.md },

  modeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  modeBtn: {
    flex: 1, borderRadius: 20, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.md,
    gap: 2,
  },
  modeBtnActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  modeIcon: { color: colors.brandSecondary, fontSize: 26, fontWeight: "700" },
  modeLabel: { color: colors.onSurface, fontSize: 15, fontWeight: "700", marginTop: 4 },
  modeLabelActive: { color: colors.onBrandPrimary },
  modeHint: { color: colors.muted, fontSize: 11 },

  receivingBox: {
    borderRadius: 24, backgroundColor: colors.surfaceSecondary,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xl, gap: spacing.sm, marginTop: spacing.md,
  },
  receivingEyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  receivingTitle: { fontFamily: font.display, color: colors.onSurface, fontSize: 26, letterSpacing: -0.3 },
  receivingBody: { ...type.body, marginBottom: spacing.md },
  scanBtn: {
    marginTop: spacing.md, alignSelf: "flex-start",
    paddingHorizontal: spacing.xl, height: 54, borderRadius: 999,
    backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center",
  },
  scanBtnText: { color: colors.onBrandPrimary, fontSize: 16, fontWeight: "700" },
  warn: { color: colors.warning, fontSize: 12, marginTop: spacing.sm, fontStyle: "italic" },

  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  sectionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  linkSmall: { color: colors.brandSecondary, fontSize: 12, fontWeight: "700" },
  switcherRow: { gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    flexShrink: 0, flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.lg, height: 36, borderRadius: 999,
    backgroundColor: colors.surfaceSecondary, borderWidth: 1, borderColor: colors.border,
    maxWidth: WIDTH * 0.55,
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  chipDelegate: { borderStyle: "dashed" },
  chipDefaultDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brandSecondary },
  chipDelegateBadge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.surfaceTertiary },
  chipDelegateBadgeText: { color: colors.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.brandSecondary, fontWeight: "700" },

  delegateBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    padding: spacing.md, borderRadius: 14,
    backgroundColor: "rgba(217, 119, 6, 0.1)", borderWidth: 1, borderColor: "rgba(217, 119, 6, 0.4)",
  },
  delegateBannerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  delegateBannerTitle: { color: colors.warning, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  delegateBannerBody: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 2 },

  emptyCard: {
    borderWidth: 1, borderColor: colors.border, borderStyle: "dashed",
    borderRadius: 28, padding: spacing.xl, backgroundColor: colors.surfaceSecondary,
    gap: spacing.sm, aspectRatio: 1.586, justifyContent: "center",
  },
  emptyEyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  emptyTitle: { fontFamily: font.display, color: colors.onSurface, fontSize: 22, letterSpacing: -0.3 },
  emptyBody: { ...type.body },
  emptyCta: { marginTop: spacing.sm },
  emptyCtaText: { color: colors.brandSecondary, fontWeight: "700", fontSize: 14 },
  setDefault: {
    alignSelf: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: 999, borderWidth: 1, borderColor: colors.border,
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
