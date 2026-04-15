/**
 * ErrorBoundary — catches JS errors in the tree and shows a fallback.
 */

import React, { Component, ErrorInfo, ReactNode } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Button, ButtonText, Text } from "@gluestack-ui/themed";
import { MIcon } from "./MIcon";
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
            <MIcon name="error-outline" size="2xl" color="$error600" />
          </View>
          <Text
            size="lg"
            fontWeight="$bold"
            color="$textLight900"
            style={styles.title}
          >
            Oups, une erreur est survenue
          </Text>
          <Text size="sm" color="$textLight500" style={styles.description}>
            L'application a rencontré un problème inattendu.
          </Text>
          <ScrollView style={styles.errorBox} horizontal>
            <Text
              size="2xs"
              color="$error700"
              style={styles.errorText}
            >
              {this.state.error?.message ?? "Unknown error"}
            </Text>
          </ScrollView>
          <Button action="primary" onPress={this.handleReset} mt="$5">
            <ButtonText>Réessayer</ButtonText>
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
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#fee2e2",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginTop: 8,
    maxWidth: 280,
  },
  errorBox: {
    maxHeight: 60,
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
    alignSelf: "stretch",
  },
  errorText: {
    fontFamily: "monospace",
  },
});
