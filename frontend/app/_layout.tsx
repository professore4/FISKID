import { Stack } from "expo-router";
import { LogBox, StatusBar, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";
import { ToastProvider } from "../src/components/Toast";
import { useFonts } from "expo-font";
import { useEffect, useState } from "react";
import { Image } from "expo-image";
import { IMAGES } from "../src/theme";

LogBox.ignoreAllLogs(true);

// Prewarm icon / hero assets to avoid first-render flicker on Expo Go Android.
Image.prefetch([IMAGES.cardBackground, IMAGES.welcomeBackground]).catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({});
  // We keep this hook to preserve future custom font loading pattern.
  const [ready, setReady] = useState(true);
  useEffect(() => { setReady(true); }, [fontsLoaded]);

  if (!ready) return <View style={{ flex: 1, backgroundColor: "#050505" }} />;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#050505" }}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" />
        <AuthProvider>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#050505" } }} />
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
