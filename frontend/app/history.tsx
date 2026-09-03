import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, RefreshControl } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { apiShareHistory } from "../src/api";
import { colors, spacing, type, font } from "../src/theme";

export default function History() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiShareHistory(token);
      setItems(r.shares || []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Pressable testID="history-back" onPress={() => router.back()} style={{ padding: spacing.sm }}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Storico condivisioni</Text>
        <View style={{ width: 90 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandSecondary} />}
          contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xl }}
        >
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Nessuna condivisione</Text>
              <Text style={styles.emptyBody}>Quando condividerai la tua Fiscal Identity Card la vedrai qui.</Text>
            </View>
          ) : (
            items.map((h) => (
              <View testID={`history-item-${h.token}`} key={h.token} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.date}>{new Date(h.created_at).toLocaleString("it-IT")}</Text>
                  <Text style={styles.sub}>
                    {h.view_count > 0 ? `Aperto ${h.view_count} volte` : "Non ancora aperto"}
                    {h.confirmed_at ? " · Confermato" : ""}
                  </Text>
                </View>
                <View
                  style={[
                    styles.pill,
                    { backgroundColor: h.is_active ? "rgba(16,185,129,0.15)" : colors.surfaceTertiary },
                  ]}
                >
                  <Text style={{ color: h.is_active ? colors.brandSecondary : colors.muted, fontSize: 11, fontWeight: "700" }}>
                    {h.is_active ? "ATTIVO" : "REVOCATO"}
                  </Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "700", letterSpacing: 0.5 },
  backText: { color: colors.onSurfaceSecondary, fontSize: 15 },
  empty: { padding: spacing.xxl, alignItems: "center", gap: spacing.sm },
  emptyTitle: { fontFamily: font.display, color: colors.onSurface, fontSize: 22 },
  emptyBody: { ...type.body, textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  date: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  sub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
});
