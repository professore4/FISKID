import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../../src/components/AppButton";
import { AppInput } from "../../src/components/AppInput";
import { useToast } from "../../src/components/Toast";
import { apiGetProfile, apiSaveProfile, apiTrackEvent, FiscalProfile } from "../../src/api";
import { useAuth } from "../../src/auth";
import { colors, spacing, type, font } from "../../src/theme";

type EntityType = "individual" | "professional" | "company";

const initial: FiscalProfile = {
  entity_type: "individual",
  first_name: "",
  last_name: "",
  business_name: "",
  vat_number: "",
  tax_code: "",
  address: "",
  street_number: "",
  postal_code: "",
  city: "",
  province: "",
  country: "IT",
  recipient_code: "",
  pec: "",
  contact_email: "",
  contact_phone: "",
};

export default function EditFiscalProfile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<FiscalProfile>({
    ...initial,
    contact_email: user?.email || "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await apiGetProfile(token);
      if (r.profile) {
        setProfile({ ...initial, ...r.profile });
        setIsNew(false);
      } else {
        apiTrackEvent("fiscal_profile_started");
      }
    } catch (e: any) {
      toast.show(e.detail || "Errore caricamento", "error");
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const set = (k: keyof FiscalProfile) => (v: string) =>
    setProfile((p) => ({ ...p, [k]: v }));

  const onSubmit = async () => {
    if (!token) return;
    const payload: FiscalProfile = {
      ...profile,
      tax_code: profile.tax_code ? profile.tax_code.trim().toUpperCase() : null,
      vat_number: profile.vat_number ? profile.vat_number.trim() : null,
      recipient_code: profile.recipient_code ? profile.recipient_code.trim().toUpperCase() : null,
      pec: profile.pec ? profile.pec.trim() : null,
      contact_email: profile.contact_email.trim(),
      address: profile.address.trim(),
      city: profile.city.trim(),
      province: profile.province.trim().toUpperCase(),
      postal_code: profile.postal_code.trim(),
    };
    setSaving(true);
    setErrors({});
    try {
      await apiSaveProfile(token, payload);
      toast.show(isNew ? "Identità fiscale creata" : "Profilo aggiornato", "success");
      router.replace("/dashboard");
    } catch (e: any) {
      if (e.detail?.errors) setErrors(e.detail.errors);
      toast.show(
        typeof e.detail === "string" ? e.detail : "Controlla i campi evidenziati",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="edit-back" onPress={() => router.back()} style={{ padding: spacing.sm }}>
          <Text style={styles.backText}>‹  Indietro</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{isNew ? "Nuovo profilo" : "Modifica profilo"}</Text>
        <View style={{ width: 90 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + 120, gap: spacing.md }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>Chi sei</Text>
        <Text style={styles.title}>Tipo di soggetto</Text>

        <View style={styles.segmentRow}>
          {(
            [
              ["individual", "Privato"],
              ["professional", "Professionista"],
              ["company", "Azienda"],
            ] as [EntityType, string][]
          ).map(([t, label]) => (
            <Pressable
              key={t}
              testID={`entity-${t}`}
              onPress={() => setProfile((p) => ({ ...p, entity_type: t }))}
              style={[
                styles.segment,
                profile.entity_type === t && styles.segmentActive,
              ]}
            >
              <Text
                style={[
                  styles.segmentText,
                  profile.entity_type === t && styles.segmentTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.eyebrow, { marginTop: spacing.lg }]}>Anagrafica</Text>
        {profile.entity_type === "company" ? (
          <AppInput
            testID="input-business-name"
            label="Ragione sociale"
            value={profile.business_name || ""}
            onChangeText={set("business_name")}
            placeholder="Es. Rossi S.r.l."
            error={errors.business_name}
          />
        ) : (
          <>
            <AppInput
              testID="input-first-name"
              label="Nome"
              value={profile.first_name || ""}
              onChangeText={set("first_name")}
              placeholder="Mario"
              error={errors.first_name}
            />
            <AppInput
              testID="input-last-name"
              label="Cognome"
              value={profile.last_name || ""}
              onChangeText={set("last_name")}
              placeholder="Rossi"
              error={errors.last_name}
            />
          </>
        )}

        <Text style={[styles.eyebrow, { marginTop: spacing.lg }]}>Dati fiscali</Text>
        {(profile.entity_type === "professional" || profile.entity_type === "company") && (
          <AppInput
            testID="input-vat"
            label="Partita IVA"
            value={profile.vat_number || ""}
            onChangeText={set("vat_number")}
            keyboardType="number-pad"
            maxLength={11}
            placeholder="11 cifre"
            error={errors.vat_number}
          />
        )}
        {profile.entity_type !== "company" && (
          <AppInput
            testID="input-cf"
            label="Codice fiscale"
            value={profile.tax_code || ""}
            onChangeText={(v) => set("tax_code")(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={16}
            placeholder="16 caratteri"
            error={errors.tax_code}
          />
        )}
        <AppInput
          testID="input-recipient"
          label="Codice destinatario"
          value={profile.recipient_code || ""}
          onChangeText={(v) => set("recipient_code")(v.toUpperCase())}
          autoCapitalize="characters"
          maxLength={7}
          placeholder="Es. 0000000 o 6-7 caratteri"
          error={errors.recipient_code}
        />
        <AppInput
          testID="input-pec"
          label="PEC"
          value={profile.pec || ""}
          onChangeText={set("pec")}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="nome@pec.example.it"
          error={errors.pec}
        />

        <Text style={[styles.eyebrow, { marginTop: spacing.lg }]}>Indirizzo</Text>
        <AppInput
          testID="input-address"
          label="Indirizzo"
          value={profile.address}
          onChangeText={set("address")}
          placeholder="Via Roma"
          error={errors.address}
        />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppInput
              testID="input-street-number"
              label="Numero civico"
              value={profile.street_number || ""}
              onChangeText={set("street_number")}
              placeholder="10"
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppInput
              testID="input-cap"
              label="CAP"
              value={profile.postal_code}
              onChangeText={set("postal_code")}
              keyboardType="number-pad"
              maxLength={5}
              placeholder="00100"
              error={errors.postal_code}
            />
          </View>
        </View>
        <AppInput
          testID="input-city"
          label="Città"
          value={profile.city}
          onChangeText={set("city")}
          placeholder="Roma"
          error={errors.city}
        />
        <View style={{ flexDirection: "row", gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppInput
              testID="input-province"
              label="Provincia"
              value={profile.province}
              onChangeText={(v) => set("province")(v.toUpperCase())}
              maxLength={2}
              autoCapitalize="characters"
              placeholder="RM"
              error={errors.province}
            />
          </View>
          <View style={{ flex: 1 }}>
            <AppInput
              testID="input-country"
              label="Paese"
              value={profile.country}
              onChangeText={(v) => set("country")(v.toUpperCase())}
              maxLength={2}
              autoCapitalize="characters"
              placeholder="IT"
            />
          </View>
        </View>

        <Text style={[styles.eyebrow, { marginTop: spacing.lg }]}>Contatti</Text>
        <AppInput
          testID="input-email"
          label="Email di contatto"
          value={profile.contact_email}
          onChangeText={set("contact_email")}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="mario@example.com"
          error={errors.contact_email}
        />
        <AppInput
          testID="input-phone"
          label="Telefono"
          value={profile.contact_phone || ""}
          onChangeText={set("contact_phone")}
          keyboardType="phone-pad"
          placeholder="+39 333 1234567"
        />

        <Text style={styles.disclaimer}>
          Le validazioni verificano il solo formato dei dati e non certificano l'esistenza fiscale del soggetto.
        </Text>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <AppButton
          testID="edit-save-button"
          title={isNew ? "Crea identità fiscale" : "Salva modifiche"}
          onPress={onSubmit}
          loading={saving}
        />
      </View>
    </KeyboardAvoidingView>
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
  eyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase" },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 22, marginBottom: spacing.md },
  segmentRow: { flexDirection: "row", gap: spacing.sm },
  segment: {
    flex: 1,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandSecondary },
  segmentText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  segmentTextActive: { color: colors.brandSecondary, fontWeight: "700" },
  disclaimer: { ...type.small, color: colors.muted, marginTop: spacing.lg, fontStyle: "italic" },
  footer: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    padding: spacing.lg,
    backgroundColor: "rgba(5,5,5,0.95)",
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
