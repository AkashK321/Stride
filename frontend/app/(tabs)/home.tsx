/**
 * Home screen - main content feed/dashboard for authenticated users.
 *
 * This is the primary tab in the authenticated app experience, accessible at "/home".
 * It will display the main content feed, dashboard, or primary app functionality.
 *
 * Currently a placeholder screen that will be expanded with actual content and features.
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Home() {
  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      },
      edges: ["top", "bottom"],
    },
    React.createElement(Text, null, "Home"),
  );
}

