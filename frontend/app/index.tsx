import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

export default function Index() {
  const { token, loading } = useAuth();
  useEffect(() => {}, []);
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandSecondary} />
      </View>
    );
  }
  return token ? <Redirect href="/dashboard" /> : <Redirect href="/welcome" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
