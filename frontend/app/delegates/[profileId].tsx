import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { useToast } from "../../src/components/Toast";
import {
  apiAddDelegate,
  apiGetProfile,
  apiListDelegates,
  apiRevokeDelegate,
  apiUpdateDelegate,
  Delegate,
  FiscalProfile,
} from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, spacing, type, font } from "../../src/theme";

type PermSet = { send: boolean; receive: boolean };

export default function DelegatesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profileId } = useLocalSearchParams<{ profileId: string }>();
  const { token } = useAuth();
  const toast = useToast();

  const [profile, setProfile] = useState<FiscalProfile | null>(null);
  const [delegates, setDelegates] = useState<Delegate[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [perms, setPerms] = useState<PermSet>({ send: true, receive: true });
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!token || !profileId) return;
    try {
      const [p, l] = await Promise.all([
        apiGetProfile(token, profileId),
        apiListDelegates(token, profileId),
      ]);
      setProfile(p.profile);
      setDelegates(l.delegates);
    } catch (e: any) {
      toast.show(e.detail || "Errore caricamento", "error");
      router.back();
    } finally {
      setLoading(false);
    }
  }, [token, profileId, toast, router]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onAdd = async () => {
    if (!token || !profileId) return;
    if (!email.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
      toast.show("Email non valida", "error");
      return;
    }
    const selected: ("send" | "receive")[] = [];
    if (perms.send) selected.push("send");
    if (perms.receive) selected.push("receive");
    if (selected.length === 0) {
      toast.show("Seleziona almeno un permesso", "error");
      return;
    }
    setAdding(true);
    try {
      await apiAddDelegate(token, profileId, email.trim(), selected);
      toast.show("Delegato aggiunto", "success");
      setEmail("");
      setPerms({ send: true, receive: true });
      load();
    } catch (e: any) {
      toast.show(e.detail || "Errore aggiunta", "error");
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (d: Delegate, key: "send" | "receive") => {
    if (!token || !profileId) return;
    const has = d.permissions.includes(key);
    let next = has
      ? d.permissions.filter((p) => p !== key)
      : [...d.permissions, key];
    if (next.length === 0) {
      toast.show("Un delegato deve avere almeno un permesso", "error");
      return;
    }
    try {
      await apiUpdateDelegate(token, profileId, d.id, next);
      toast.show("Permessi aggiornati", "success");
      load();
    } catch (e: any) {
      toast.show(e.detail || "Errore", "error");
    }
  };

  const onRevoke = async (d: Delegate) => {
    if (!token || !profileId) return;
    try {
      await apiRevokeDelegate(token, profileId, d.id);
      toast.show("Delegato revocato", "success");
      load();
    } catch (e: any) {
      toast.show(e.detail || "Errore", "error");
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="delegates-back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/dashboard"))} style={{ padding: spacing.sm }}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Delegati</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl, gap: spacing.lg }}
        keyboardShouldPersistTaps="handled"
      >
        <View>
          <Text style={styles.eyebrow}>Identità aziendale</Text>
          <Text style={styles.title}>{profile?.label || profile?.business_name}</Text>
          <Text style={styles.body}>
            I delegati possono usare i dati fiscali di quest'azienda per emettere o ricevere fatture,
            ma non possono modificarli. Solo l'amministratore può gestire i delegati.
          </Text>
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Aggiungi delegato</Text>
          <AppInput
            testID="delegate-email-input"
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="collaboratore@example.it"
          />
          <Text style={styles.permLabel}>Permessi</Text>
          <View style={styles.permRow}>
            <PermChip
              testID="perm-send"
              label="Invio dati (emissione fattura)"
              value={perms.send}
              onToggle={() => setPerms((p) => ({ ...p, send: !p.send }))}
            />
            <PermChip
              testID="perm-receive"
              label="Ricezione dati (scansione)"
              value={perms.receive}
              onToggle={() => setPerms((p) => ({ ...p, receive: !p.receive }))}
            />
          </View>
          <AppButton
            testID="add-delegate-button"
            title="Aggiungi delegato"
            onPress={onAdd}
            loading={adding}
            style={{ marginTop: spacing.md }}
          />
        </View>

        <View style={styles.box}>
          <Text style={styles.section}>Delegati attivi ({delegates.length})</Text>
          {delegates.length === 0 ? (
            <Text style={styles.empty}>Non hai ancora delegati.</Text>
          ) : (
            delegates.map((d) => (
              <View key={d.id} testID={`delegate-row-${d.id}`} style={styles.delegateRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={styles.email} numberOfLines={1}>{d.email}</Text>
                    <View style={[styles.pill, d.status === "active" ? styles.pillActive : styles.pillInvited]}>
                      <Text style={{ color: d.status === "active" ? colors.brandSecondary : colors.warning, fontSize: 10, fontWeight: "700" }}>
                        {d.status === "active" ? "ATTIVO" : "INVITATO"}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: "row", gap: spacing.xs, marginTop: 4 }}>
                    <Pressable
                      testID={`toggle-send-${d.id}`}
                      onPress={() => toggle(d, "send")}
                      style={[styles.miniChip, d.permissions.includes("send") && styles.miniChipOn]}
                    >
                      <Text style={[styles.miniChipText, d.permissions.includes("send") && styles.miniChipTextOn]}>Invio</Text>
                    </Pressable>
                    <Pressable
                      testID={`toggle-receive-${d.id}`}
                      onPress={() => toggle(d, "receive")}
                      style={[styles.miniChip, d.permissions.includes("receive") && styles.miniChipOn]}
                    >
                      <Text style={[styles.miniChipText, d.permissions.includes("receive") && styles.miniChipTextOn]}>Ricezione</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable
                  testID={`revoke-${d.id}`}
                  onPress={() => onRevoke(d)}
                  style={styles.revokeBtn}
                >
                  <Text style={styles.revokeText}>Revoca</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PermChip({ label, value, onToggle, testID }: { label: string; value: boolean; onToggle: () => void; testID?: string }) {
  return (
    <Pressable
      testID={testID}
      onPress={onToggle}
      style={[styles.permChip, value && styles.permChipOn]}
    >
      <View style={[styles.tickBox, value && styles.tickBoxOn]}>
        {value ? <Text style={styles.tickMark}>✓</Text> : null}
      </View>
      <Text style={[styles.permChipText, value && styles.permChipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  eyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 30, letterSpacing: -0.3, marginTop: 4, marginBottom: spacing.sm },
  body: { ...type.body },
  box: {
    backgroundColor: colors.surfaceSecondary, borderRadius: 20,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.sm,
  },
  section: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: spacing.sm },
  permLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", marginLeft: spacing.xs, marginTop: spacing.xs },
  permRow: { gap: spacing.sm },
  permChip: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg,
    borderRadius: 14, backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  permChipOn: { borderColor: colors.brandSecondary, backgroundColor: colors.brandTertiary },
  permChipText: { color: colors.onSurfaceSecondary, fontSize: 14, fontWeight: "600", flex: 1 },
  permChipTextOn: { color: colors.brandSecondary },
  tickBox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  tickBoxOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  tickMark: { color: colors.onBrandPrimary, fontSize: 14, fontWeight: "900" },
  empty: { color: colors.muted, fontSize: 13, fontStyle: "italic", paddingVertical: spacing.sm },
  delegateRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.divider,
  },
  email: { color: colors.onSurface, fontSize: 14, fontWeight: "600", flex: 1 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  pillActive: { backgroundColor: "rgba(16,185,129,0.15)" },
  pillInvited: { backgroundColor: "rgba(217, 119, 6, 0.15)" },
  miniChip: {
    paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: 999,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  miniChipOn: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  miniChipText: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  miniChipTextOn: { color: colors.brandSecondary, fontWeight: "700" },
  revokeBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: 999, borderWidth: 1, borderColor: colors.error },
  revokeText: { color: colors.error, fontSize: 11, fontWeight: "700" },
});
