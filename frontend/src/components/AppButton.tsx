import React from "react";
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  StyleProp,
} from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radius, spacing } from "../theme";

type Props = {
  title: string;
  onPress?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
  testID?: string;
  style?: StyleProp<ViewStyle>;
  icon?: React.ReactNode;
};

export function AppButton({
  title,
  onPress,
  loading,
  disabled,
  variant = "primary",
  testID,
  style,
  icon,
}: Props) {
  const handle = () => {
    if (loading || disabled || !onPress) return;
    try {
      Haptics.selectionAsync();
    } catch {}
    onPress();
  };

  const isSecondary = variant === "secondary";
  const isGhost = variant === "ghost";

  return (
    <Pressable
      testID={testID}
      onPress={handle}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isSecondary && styles.secondary,
        isGhost && styles.ghost,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        (disabled || loading) && { opacity: 0.55 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isSecondary || isGhost ? colors.onSurface : colors.onBrandPrimary} />
      ) : (
        <>
          {icon}
          <Text
            style={[
              styles.text,
              isSecondary && { color: colors.onSurface },
              isGhost && { color: colors.onSurfaceSecondary },
            ]}
          >
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.brandPrimary,
    height: 54,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  secondary: {
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  text: {
    color: colors.onBrandPrimary,
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
