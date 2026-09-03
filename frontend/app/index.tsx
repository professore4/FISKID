import { View, ActivityIndicator, StyleSheet } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

export default function Index() {
  const { token, loading, hasPin, unlocked } = useAuth();
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brandSecondary} />
      </View>
    );
  }
  if (!token) return <Redirect href="/welcome" />;
  if (hasPin && !unlocked) return <Redirect href="/lock" />;
  if (!hasPin) return <Redirect href="/set-pin" />;
  return <Redirect href="/dashboard" />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
