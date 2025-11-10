import { Redirect } from 'expo-router';
import React from 'react';

// Use the Redirect component so navigation occurs safely when the router mounts.
export default function Index() {
  return <Redirect href="/login" />;
}
