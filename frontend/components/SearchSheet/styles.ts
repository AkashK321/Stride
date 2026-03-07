import { StyleSheet, Dimensions } from "react-native";
import { colors } from "../../theme/colors";
import { radii } from "../../theme/radius";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const RESULTS_MAX_HEIGHT = Dimensions.get("window").height * 0.68;

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
  recentsContainer: {
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.medium,
    overflow: "hidden",
  },
  resultsContainer: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: radii.medium,
    overflow: "hidden",
    maxHeight: RESULTS_MAX_HEIGHT,
  },
  listContent: {
    paddingBottom: 0,
    paddingTop: 0,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.secondary,
    marginHorizontal: spacing.md,
  },
  recentsSection: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  recentsHeader: {
    ...typography.h3,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  recentsFooterSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.secondary,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
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
