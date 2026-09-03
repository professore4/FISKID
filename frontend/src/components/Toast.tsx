import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

type ToastKind = "success" | "error" | "info";
type ToastCtx = { show: (msg: string, kind?: ToastKind) => void };
const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<ToastKind>("info");
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const show = useCallback((m: string, k: ToastKind = "info") => {
    setMsg(m);
    setKind(k);
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(
        () => setMsg(null),
      );
    }, 2600);
  }, [opacity]);

  const color =
    kind === "success" ? colors.brandSecondary : kind === "error" ? colors.error : colors.onSurface;

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      {msg && (
        <Animated.View
          pointerEvents="none"
          testID="app-toast"
          style={[styles.wrap, { opacity }]}
        >
          <View style={[styles.toast, { borderColor: color }]}>
            <View style={[styles.dot, { backgroundColor: color }]} />
            <Text style={styles.text}>{msg}</Text>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("ToastProvider missing");
  return c;
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 60,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
    elevation: 20,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    maxWidth: 340,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { color: colors.onSurface, fontSize: 14, flexShrink: 1 },
});
