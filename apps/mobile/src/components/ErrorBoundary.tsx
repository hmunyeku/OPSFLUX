/**
 * Error boundary — catches JS errors in the component tree and shows a fallback.
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, Text } from "react-native-paper";
import { captureError } from "../services/sentry";
import { colors } from "../utils/colors";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
    captureError(error, { componentStack: info.componentStack ?? "" });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>!</Text>
          </View>
          <Text variant="headlineSmall" style={styles.title}>
            Oups, une erreur est survenue
          </Text>
          <Text variant="bodyMedium" style={styles.description}>
            L'application a rencontré un problème inattendu.
          </Text>
          <ScrollView style={styles.errorBox} horizontal>
            <Text variant="bodySmall" style={styles.errorText}>
              {this.state.error?.message ?? "Unknown error"}
            </Text>
          </ScrollView>
          <Button mode="contained" onPress={this.handleReset} style={styles.button}>
            Réessayer
          </Button>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    backgroundColor: colors.background,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.danger + "15",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  iconText: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.danger,
  },
  title: {
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
  },
  description: {
    color: colors.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },
  errorBox: {
    maxHeight: 60,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 6,
  },
  errorText: {
    fontFamily: "monospace",
    color: colors.danger,
    fontSize: 11,
  },
  button: {
    marginTop: 24,
  },
});
