/**
 * UI Components screen - used to display all UI components and their usage.
 *
 * This tab screen, accessible at "/ui_components", allows devs to look at UI components 
 * and their usage in the app.
 */
import * as React from "react";
import { View, Text, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Button from "../../components/Button";
import TextField from "../../components/TextField";
import Label from "../../components/Label";
import { typography } from "../../theme/typography";
import { spacing } from "../../theme/spacing";
import { colors } from "../../theme/colors";

export default function UIComponents() {
  const [textField1, setTextField1] = React.useState("");
  const [textField2, setTextField2] = React.useState("");
  const [textField3, setTextField3] = React.useState("");
  const [textField4, setTextField4] = React.useState("invalid@email");
  const [textField5, setTextField5] = React.useState("Cannot edit this");
  const [textField6, setTextField6] = React.useState("");
  const [textField7, setTextField7] = React.useState("");
  const [textField8, setTextField8] = React.useState("");

  return React.createElement(
    SafeAreaView,
    {
      style: {
        flex: 1,
      },
      edges: ["top", "bottom"],
    },
    React.createElement(
      ScrollView,
      {
        style: {
          flex: 1,
        },
        contentContainerStyle: {
          padding: spacing.lg,
          gap: spacing.xl,
        },
      },
    // Header
    React.createElement(
      Text,
      {
        style: typography.h1,
      },
      "Button Components",
    ),
    
    // Variants Section
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Variants",
      ),
      // Primary variant
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Primary:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Primary Button",
            variant: "primary",
          }),
        ),
      ),
      // Secondary variant
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Secondary:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Secondary Button",
            variant: "secondary",
          }),
        ),
      ),
      // Danger variant
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Danger:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Danger Button",
            variant: "danger",
          }),
        ),
      ),
    ),

    // Sizes Section
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Sizes",
      ),
      // Small size
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Small:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Small Button",
            size: "small",
          }),
        ),
      ),
      // Medium size
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Medium:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Medium Button",
            size: "medium",
          }),
        ),
      ),
      // Large size
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Large:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Large Button",
            size: "large",
          }),
        ),
      ),
    ),

    // States Section
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "States",
      ),
      // Disabled state
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Disabled:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Disabled Button",
            disabled: true,
          }),
        ),
      ),
      // Loading state
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Loading:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Loading Button",
            loading: true,
          }),
        ),
      ),
    ),

    // Combinations Section
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Combinations",
      ),
      // Small secondary
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Small Secondary:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Small Secondary",
            variant: "secondary",
            size: "small",
          }),
        ),
      ),
      // Large danger
      React.createElement(
        View,
        {
          style: {
            flexDirection: "row",
            alignItems: "center",
            gap: spacing.md,
          },
        },
        React.createElement(
          Text,
          {
            style: {
              ...typography.body,
              width: 100,
            },
          },
          "Large Danger:",
        ),
        React.createElement(
          View,
          {
            style: {
              flex: 1,
            },
          },
          React.createElement(Button, {
            onPress: () => {},
            title: "Large Danger",
            variant: "danger",
            size: "large",
          }),
        ),
      ),
    ),

    // TextField Components Section
    React.createElement(
      Text,
      {
        style: typography.h1,
      },
      "TextField Components",
    ),

    // Basic TextField
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Basic",
      ),
      React.createElement(TextField, {
        value: textField1,
        onChangeText: setTextField1,
        placeholder: "Enter text...",
      }),
    ),

    // With Label
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "With Label",
      ),
      React.createElement(TextField, {
        value: textField2,
        onChangeText: setTextField2,
        placeholder: "Enter your name",
        label: "Name",
      }),
    ),

    // Required Field
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Required Field",
      ),
      React.createElement(TextField, {
        value: textField3,
        onChangeText: setTextField3,
        placeholder: "Enter email",
        label: "Email",
        required: true,
      }),
    ),

    // Error State
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Error State",
      ),
      React.createElement(TextField, {
        value: textField4,
        onChangeText: setTextField4,
        placeholder: "Enter email",
        label: "Email",
        error: "Please enter a valid email address",
      }),
    ),

    // Disabled State
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "States",
      ),
      React.createElement(TextField, {
        value: textField5,
        onChangeText: setTextField5,
        placeholder: "Disabled field",
        label: "Disabled Field",
        disabled: true,
      }),
    ),

    // Password Field
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Password",
      ),
      React.createElement(TextField, {
        value: textField6,
        onChangeText: setTextField6,
        placeholder: "Enter password",
        label: "Password",
        secureTextEntry: true,
        required: true,
      }),
    ),

    // Email Field
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Keyboard Types",
      ),
      React.createElement(TextField, {
        value: textField7,
        onChangeText: setTextField7,
        placeholder: "you@example.com",
        label: "Email",
        keyboardType: "email-address",
        required: true,
      }),
    ),

    // Numeric Field
    React.createElement(
      View,
      {
        style: {
          gap: spacing.sm,
        },
      },
      React.createElement(TextField, {
        value: textField8,
        onChangeText: setTextField8,
        placeholder: "Enter number",
        label: "Phone Number",
        keyboardType: "numeric",
      }),
    ),

    // Label Components Section
    React.createElement(
      Text,
      {
        style: typography.h1,
      },
      "Label Components",
    ),

    // Screen Title
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Screen Title",
      ),
      React.createElement(
        Label,
        {
          variant: "screenTitle",
          style: { marginBottom: spacing.sm },
        },
        "Welcome back to ",
        React.createElement(Text, {
          style: { color: colors.primary },
        }, "Stride."),
      ),
    ),

    // Section Header
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Section Header",
      ),
      React.createElement(
        Label,
        {
          variant: "sectionHeader",
        },
        "Account Settings",
      ),
    ),

    // Form Header
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Form Header",
      ),
      React.createElement(
        Label,
        {
          variant: "formHeader",
        },
        "Personal Information",
      ),
    ),

    // Form Label
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Form Label",
      ),
      React.createElement(
        Label,
        {
          variant: "formLabel",
        },
        "Email Address",
      ),
    ),

    // Error Message
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Error Message",
      ),
      React.createElement(
        Label,
        {
          variant: "error",
        },
        "Please enter a valid email address",
      ),
    ),

    // Caption/Helper Text
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Caption",
      ),
      React.createElement(
        Label,
        {
          variant: "caption",
        },
        "Must be at least 8 characters",
      ),
    ),

    // Body Text
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Body Text",
      ),
      React.createElement(
        Label,
        {
          variant: "body",
        },
        "This is standard body text",
      ),
    ),

    // Custom Color Override
    React.createElement(
      View,
      {
        style: {
          gap: spacing.md,
        },
      },
      React.createElement(
        Text,
        {
          style: {
            ...typography.h1,
            fontSize: 20,
            marginBottom: spacing.sm,
          },
        },
        "Color Override",
      ),
      React.createElement(
        Label,
        {
          variant: "body",
          color: colors.primary,
        },
        "This text is in primary color",
      ),
    ),
    ),
  );
}

