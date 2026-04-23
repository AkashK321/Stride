import * as React from "react";
import { Stack } from "expo-router";

export default function ProfileLayout() {
  return React.createElement(Stack, {
    screenOptions: {
      // Set to true if you want the native iOS/Android header at the top
      // Set to false since your screens already use safe areas and custom text headers
      headerShown: false, 
    },
  });
}