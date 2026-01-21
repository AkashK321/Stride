import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    // Make the login screen the initial route so users land on authentication first.
    <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
      <Stack.Screen name="login" />
      <Stack.Screen name="App" />
      <Stack.Screen name="index" />
    </Stack>
  );
}
