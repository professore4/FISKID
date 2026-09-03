import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { AppButton } from "../src/components/AppButton";
import { useToast } from "../src/components/Toast";
import { colors, spacing, type, font } from "../src/theme";
import { APP_BASE_URL } from "../src/api";

export default function Scanner() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const lockRef = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const handleScan = (data: string) => {
    if (lockRef.current) return;
    // Accept both a full URL and a raw token
    let token: string | null = null;
    try {
      if (data.startsWith("http")) {
        const parts = data.split("/share/");
        if (parts.length === 2) token = parts[1].split(/[?#]/)[0];
      } else if (/^[A-Za-z0-9_-]{16,}$/.test(data)) {
        token = data;
      }
    } catch {}
    if (!token) {
      toast.show("QR non riconosciuto", "error");
      return;
    }
    lockRef.current = true;
    router.push(`/share/${token}`);
    setTimeout(() => { lockRef.current = false; }, 1500);
  };

  if (Platform.OS === "web") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <Header onClose={() => router.back()} />
        <View style={styles.webCenter}>
          <Text style={styles.title}>Scanner disponibile su app mobile</Text>
          <Text style={styles.body}>
            La scansione tramite fotocamera è supportata su iOS e Android. Su web puoi aprire direttamente il link condiviso dall'utente.
          </Text>
          <AppButton title="Torna indietro" onPress={() => router.back()} variant="secondary" />
        </View>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandSecondary} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl }]}>
        <Header onClose={() => router.back()} />
        <View style={styles.webCenter}>
          <Text style={styles.title}>Serve l'accesso alla fotocamera</Text>
          <Text style={styles.body}>
            Per scansionare il QR, abilita l'accesso alla fotocamera per FiskID.
          </Text>
          <AppButton title="Consenti fotocamera" onPress={requestPermission} />
          <AppButton
            title="Apri impostazioni"
            variant="secondary"
            onPress={() => Linking.openSettings()}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          scanning
            ? ({ data }) => {
                setScanning(false);
                handleScan(data);
                setTimeout(() => setScanning(true), 2000);
              }
            : undefined
        }
      />

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View style={styles.overlayTop} />
        <View style={styles.overlayCenter}>
          <View style={styles.overlaySide} />
          <View style={styles.reticle} testID="scanner-reticle">
            {[
              [0, 0, 1, 0, 0, 1],
              [1, 0, 0, 0, 0, 1],
              [0, 1, 1, 0, 0, 0],
              [1, 1, 0, 0, 0, 0],
            ].map((_, i) => (
              <View key={i} style={[styles.corner, corners[i]]} />
            ))}
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom} />
      </View>

      <View style={[styles.headerAbs, { paddingTop: insets.top + spacing.md }]}>
        <Pressable testID="scanner-close" onPress={() => router.back()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={[styles.hint, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <Text style={styles.hintEyebrow}>MODALITÀ OPERATORE</Text>
        <Text style={styles.hintTitle}>Inquadra il QR FiskID</Text>
        <Text style={styles.hintBody}>Vedrai i dati fiscali del cliente in un istante.</Text>
      </View>
    </View>
  );
}

const corners = [
  { top: 0, left: 0, borderTopLeftRadius: 12, borderTopWidth: 4, borderLeftWidth: 4 },
  { top: 0, right: 0, borderTopRightRadius: 12, borderTopWidth: 4, borderRightWidth: 4 },
  { bottom: 0, left: 0, borderBottomLeftRadius: 12, borderBottomWidth: 4, borderLeftWidth: 4 },
  { bottom: 0, right: 0, borderBottomRightRadius: 12, borderBottomWidth: 4, borderRightWidth: 4 },
];

function Header({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable testID="scanner-close-alt" onPress={onClose} style={{ padding: spacing.sm }}>
        <Text style={styles.backText}>‹  Indietro</Text>
      </Pressable>
    </View>
  );
}

const RETICLE = 260;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  header: { paddingHorizontal: spacing.lg },
  headerAbs: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, flexDirection: "row" },
  closeBtn: { padding: spacing.md, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  closeText: { color: "#fff", fontSize: 16 },
  backText: { color: colors.onSurface, fontSize: 15 },
  webCenter: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  title: { fontFamily: font.display, color: colors.onSurface, fontSize: 26, textAlign: "center" },
  body: { ...type.body, textAlign: "center", maxWidth: 320, marginBottom: spacing.md },
  overlayTop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  overlayCenter: { flexDirection: "row", height: RETICLE },
  overlayBottom: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  overlaySide: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  reticle: { width: RETICLE, height: RETICLE, position: "relative" },
  corner: { position: "absolute", width: 32, height: 32, borderColor: colors.brandSecondary },
  hint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
  },
  hintEyebrow: { color: colors.brandSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  hintTitle: { fontFamily: font.display, color: "#fff", fontSize: 22 },
  hintBody: { color: "rgba(255,255,255,0.8)", fontSize: 14, textAlign: "center" },
});
