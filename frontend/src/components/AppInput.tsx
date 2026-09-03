import React from "react";
import { View, Text, TextInput, StyleSheet, TextInputProps } from "react-native";
import { colors, radius, spacing } from "../theme";

type Props = TextInputProps & {
  label: string;
  error?: string | null;
  helperText?: string;
};

export function AppInput({ label, error, helperText, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.muted}
        {...rest}
        style={[styles.input, error && styles.inputError, style]}
      />
      {error ? (
        <Text style={styles.error} testID={`${rest.testID ?? "input"}-error`}>{error}</Text>
      ) : helperText ? (
        <Text style={styles.helper}>{helperText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginBottom: spacing.md },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginLeft: spacing.xs,
  },
  input: {
    backgroundColor: colors.surfaceSecondary,
    color: colors.onSurface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputError: { borderColor: colors.error },
  error: { color: colors.error, fontSize: 12, marginLeft: spacing.xs },
  helper: { color: colors.muted, fontSize: 12, marginLeft: spacing.xs },
});
