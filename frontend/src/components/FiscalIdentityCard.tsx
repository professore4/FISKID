import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing, IMAGES, font } from "../theme";

type Props = {
  displayName: string;
  entityLabel: string;
  vatMasked?: string | null;
  status?: string;
  onPress?: () => void;
  testID?: string;
};

export function FiscalIdentityCard({
  displayName,
  entityLabel,
  vatMasked,
  status = "Profilo completo",
  onPress,
  testID,
}: Props) {
  const handle = () => {
    if (!onPress) return;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft); } catch {}
    onPress();
  };

  return (
    <Pressable
      testID={testID}
      onPress={onPress ? handle : undefined}
      style={({ pressed }) => [
        styles.card,
        pressed && onPress && { transform: [{ scale: 0.985 }] },
      ]}
    >
      <Image
        source={{ uri: IMAGES.cardBackground }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={400}
      />
      <LinearGradient
        colors={["rgba(0,0,0,0.05)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.9)"]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.brandDot} />
          <Text style={styles.brand}>FiskID</Text>
        </View>

        <View style={{ flex: 1 }} />

        <Text style={styles.identityLabel}>Identità fiscale</Text>
        <Text style={styles.name} numberOfLines={2}>
          {displayName}
        </Text>

        <View style={styles.bottomRow}>
          <View>
            <Text style={styles.smallLabel}>Tipo</Text>
            <Text style={styles.smallValue}>{entityLabel}</Text>
          </View>
          {vatMasked ? (
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.smallLabel}>P. IVA</Text>
              <Text style={styles.smallValue}>{vatMasked}</Text>
            </View>
          ) : (
            <View style={styles.statusPill}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>{status}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1.586, // credit-card ratio
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  content: {
    flex: 1,
    padding: spacing.xl,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brandDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brandSecondary,
  },
  brand: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 2,
  },
  identityLabel: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: spacing.xs,
    fontWeight: "600",
  },
  name: {
    color: colors.onSurface,
    fontFamily: font.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.3,
    marginBottom: spacing.lg,
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  smallLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 2,
    fontWeight: "600",
  },
  smallValue: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(5, 150, 105, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(16, 185, 129, 0.5)",
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brandSecondary,
  },
  statusText: {
    color: colors.brandSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
});

export function maskVat(vat?: string | null): string | null {
  if (!vat) return null;
  if (vat.length <= 4) return vat;
  return `•• •• •• •• ${vat.slice(-3)}`;
}

export function getDisplayName(p: any): string {
  if (!p) return "";
  if (p.entity_type === "company") return p.business_name || "—";
  const parts = [p.first_name, p.last_name].filter(Boolean);
  return parts.join(" ") || "—";
}

export function getEntityLabel(t?: string): string {
  switch (t) {
    case "individual":
      return "Privato";
    case "professional":
      return "Professionista";
    case "company":
      return "Azienda";
    default:
      return "—";
  }
}
