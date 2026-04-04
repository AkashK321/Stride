/**
 * DEV ONLY — pick a floor-2 map node id for dead-reckoning overlay metadata.
 */
import * as React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
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
  const [query, setQuery] = React.useState("");

  React.useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => n.id.toLowerCase().includes(q));
  }, [nodes, query]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.45)",
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          style={{
            maxHeight: "72%",
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
    </Modal>
  );
}
