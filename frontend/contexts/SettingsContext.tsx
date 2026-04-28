/**
 * SettingsContext.tsx
 * Global state management for user application preferences.
 */
import * as React from "react";

interface SettingsContextType {
  cameraMode: boolean;
  setCameraMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SettingsContext = React.createContext<SettingsContextType>({
  cameraMode: true,
  setCameraMode: () => {},
});

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cameraMode, setCameraMode] = React.useState(true);

  return React.createElement(
    SettingsContext.Provider,
    { value: { cameraMode, setCameraMode } },
    children
  );
};

export const useSettings = () => React.useContext(SettingsContext);