import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, spacing } from "../theme";

type Props = {
  value: string;
  onChange: (next: string) => void;
  length?: number;
  error?: boolean;
  onBiometric?: (() => void) | null;
  biometricLabel?: string;
};

export function PinKeypad({ value, onChange, length = 6, error, onBiometric, biometricLabel }: Props) {
  const press = (digit: string) => {
    if (value.length >= length) return;
    try { Haptics.selectionAsync(); } catch {}
    onChange(value + digit);
  };
  const back = () => {
    if (!value.length) return;
    try { Haptics.selectionAsync(); } catch {}
    onChange(value.slice(0, -1));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.dots}>
        {Array.from({ length }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i < value.length && styles.dotFilled,
              error && styles.dotError,
            ]}
            testID={`pin-dot-${i}`}
          />
        ))}
      </View>

      <View style={styles.grid}>
        {["1","2","3","4","5","6","7","8","9"].map((n) => (
          <Key key={n} label={n} onPress={() => press(n)} />
        ))}
        <Pressable
          testID="pin-key-bio"
          onPress={onBiometric || undefined}
          disabled={!onBiometric}
          style={[styles.key, !onBiometric && { opacity: 0 }]}
        >
          <Text style={styles.keyBio}>{biometricLabel || "◉"}</Text>
        </Pressable>
        <Key label="0" onPress={() => press("0")} />
        <Pressable testID="pin-key-back" onPress={back} style={styles.key}>
          <Text style={styles.keyBack}>⌫</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Key({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      testID={`pin-key-${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.key, pressed && { backgroundColor: colors.surfaceTertiary }]}
    >
      <Text style={styles.keyText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.xl },
  dots: { flexDirection: "row", gap: spacing.md },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: "transparent",
  },
  dotFilled: { backgroundColor: colors.brandSecondary, borderColor: colors.brandSecondary },
  dotError: { borderColor: colors.error, backgroundColor: "transparent" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 260,
    justifyContent: "space-between",
    gap: spacing.md,
  },
  key: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: colors.surfaceSecondary,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  keyText: { color: colors.onSurface, fontSize: 26, fontWeight: "500" },
  keyBio: { color: colors.brandSecondary, fontSize: 24 },
  keyBack: { color: colors.onSurfaceSecondary, fontSize: 22 },
});
