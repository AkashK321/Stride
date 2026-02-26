import { StyleSheet } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

export const sheetStyles = StyleSheet.create({
  background: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.large,
    borderTopRightRadius: radii.large,
  },
  handleIndicator: {
    backgroundColor: colors.placeholder,
    width: 36,
    height: 5,
    borderRadius: 2.5,
  },
  content: {
    flex: 1,
  },
});

export const searchInputStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.medium,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.sm + 4,
    height: 40,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    ...typography.input,
    flex: 1,
    color: colors.text,
    padding: 0,
  },
  clearButton: {
    padding: spacing.xs,
  },
});

export const resultItemStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.backgroundSecondary,
  },
  pressed: {
    backgroundColor: colors.backgroundSecondary,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm + 4,
  },
  textContainer: {
    flex: 1,
  },
  name: {
    ...typography.body,
    color: colors.text,
  },
  floor: {
    ...typography.label,
    color: colors.textSecondary,
    marginTop: 1,
  },
});

export const resultsListStyles = StyleSheet.create({
  listContent: {
    paddingBottom: spacing.xl,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xl + spacing.md,
  },
  emptyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  retryText: {
    ...typography.button,
    color: colors.primary,
  },
});
