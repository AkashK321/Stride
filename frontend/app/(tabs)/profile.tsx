/**
 * Profile screen - user's personal profile and account information.
 *
 * This tab screen, accessible at "/profile", displays the authenticated user's profile,
 * account details, and personal information. Users can view and edit their profile data here.
 *
 * Currently a placeholder screen that will be expanded with profile management features.
 * Uses React.createElement (non-JSX) to match the project's TypeScript configuration.
 */
import * as React from "react";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function Profile() {
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
    React.createElement(Text, null, "Profile"),
  );
}

