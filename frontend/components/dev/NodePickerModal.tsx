/**
 * DEV ONLY — pick a floor-2 map node id for dead-reckoning overlay metadata.
 */
import * as React from "react";
import {
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import type { Floor2Node } from "../../data/floor2Nodes";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

type NodePickerModalProps = {
  visible: boolean;
  title: string;
  nodes: Floor2Node[];
  selectedId: string;
  onSelect: (nodeId: string) => void;
  onClose: () => void;
};

export default function NodePickerModal({
  visible,
  title,
  nodes,
  selectedId,
  onSelect,
  onClose,
}: NodePickerModalProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = React.useState("");
  const [keyboardBottomInset, setKeyboardBottomInset] = React.useState(0);

  /**
   * Cap sheet height so it stays in the safe band: below the notch (SafeAreaView + inset)
   * and above the keyboard. Avoids the sheet spanning into unsafe top or under the keyboard.
   */
  const sheetMaxHeight = React.useMemo(() => {
    const innerViewportH = windowHeight - insets.top;
    const flexColumnH = innerViewportH - keyboardBottomInset;
    const spaceForSheet = flexColumnH - spacing.md * 2;
    const defaultCap = windowHeight * 0.55;
    return Math.min(defaultCap, Math.max(220, spaceForSheet));
  }, [windowHeight, keyboardBottomInset, insets.top]);

  React.useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  React.useEffect(() => {
    if (!visible) {
      setKeyboardBottomInset(0);
      return;
    }
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: { endCoordinates: { height: number } }) => {
      setKeyboardBottomInset(e.endCoordinates.height);
    };
    const onHide = () => setKeyboardBottomInset(0);
    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
      setKeyboardBottomInset(0);
    };
  }, [visible]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.id.toLowerCase().includes(q));
  }, [nodes, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)" }}
        edges={["top", "left", "right"]}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
            paddingBottom: keyboardBottomInset,
          }}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
          <View
            style={{
              maxHeight: sheetMaxHeight,
              height: sheetMaxHeight,
              backgroundColor: "#fff",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
              padding: spacing.md,
              gap: spacing.sm,
            }}
          >
          <Text style={typography.h3}>{title}</Text>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search node id…"
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              borderWidth: 1,
              borderColor: "#D1D5DB",
              borderRadius: 8,
              paddingHorizontal: spacing.sm,
              paddingVertical: spacing.sm,
            }}
          />
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ flex: 1, minHeight: 0 }}
            contentContainerStyle={{ paddingBottom: spacing.sm }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.id);
                  onClose();
                }}
                style={({ pressed }) => ({
                  paddingVertical: spacing.sm,
                  paddingHorizontal: spacing.xs,
                  backgroundColor:
                    item.id === selectedId ? "#E8F5E9" : pressed ? "#F3F4F6" : "transparent",
                  borderRadius: 6,
                })}
              >
                <Text style={{ ...typography.body, fontFamily: "monospace" }}>{item.id}</Text>
                <Text style={typography.caption}>
                  ({item.xFeet}, {item.yFeet}) ft
                </Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ ...typography.caption, padding: spacing.md }}>No matches.</Text>
            }
          />
          <Pressable
            onPress={onClose}
            style={{
              alignItems: "center",
              padding: spacing.sm,
            }}
          >
            <Text style={{ color: "#2563EB", fontWeight: "600" }}>Cancel</Text>
          </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
