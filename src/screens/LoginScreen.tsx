/**
 * LoginScreen — sober, professional login.
 *
 * Clean white background, typography-driven, minimal visuals.
 * Inspired by Linear/Stripe auth screens.
 */

import React, { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Text, TextInput } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import { login, verifyMfa } from "../services/auth";
import { useAuthStore } from "../stores/auth";
import { setBaseUrl } from "../services/api";
import { colors } from "../utils/colors";
import { radius, spacing, typography } from "../utils/design";

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [serverUrl, setServerUrl] = useState(useAuthStore.getState().baseUrl);
  const [showServerField, setShowServerField] = useState(false);

  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const [loading, setLoading] = useState(false);
  const { setTokens, setBaseUrl: storeSetBaseUrl } = useAuthStore();

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert("Erreur", "Veuillez saisir votre email et mot de passe.");
      return;
    }

    setLoading(true);
    try {
      if (serverUrl && serverUrl !== useAuthStore.getState().baseUrl) {
        setBaseUrl(serverUrl);
        storeSetBaseUrl(serverUrl);
      }

      const response = await login(email.trim(), password);
      if (response.mfa_required && response.mfa_token) {
        setMfaToken(response.mfa_token);
        setMfaRequired(true);
      } else {
        setTokens(response.access_token, response.refresh_token);
      }
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Identifiants incorrects.";
      Alert.alert("Erreur de connexion", message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify() {
    if (!mfaCode.trim()) {
      Alert.alert("Erreur", "Veuillez saisir le code MFA.");
      return;
    }
    setLoading(true);
    try {
      const response = await verifyMfa(mfaToken, mfaCode.trim());
      setTokens(response.access_token, response.refresh_token);
    } catch (err: any) {
      const message = err?.response?.data?.detail || "Code MFA invalide.";
      Alert.alert("Erreur MFA", message);
    } finally {
      setLoading(false);
    }
  }

  if (mfaRequired) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.root}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: insets.top + spacing["3xl"] },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <Ionicons
              name="shield-checkmark-outline"
              size={40}
              color={colors.primary}
              style={{ marginBottom: spacing.lg }}
            />
            <Text style={styles.title}>Vérification en 2 étapes</Text>
            <Text style={styles.subtitle}>
              Saisissez le code à 6 chiffres depuis votre application d'authentification.
            </Text>

            <TextInput
              mode="outlined"
              label="Code"
              value={mfaCode}
              onChangeText={setMfaCode}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              style={styles.input}
              contentStyle={styles.mfaInput}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
            />

            <Button
              mode="contained"
              onPress={handleMfaVerify}
              loading={loading}
              disabled={loading || mfaCode.length < 6}
              style={styles.primaryButton}
              contentStyle={styles.primaryButtonContent}
              labelStyle={styles.primaryButtonLabel}
              buttonColor={colors.primary}
            >
              Vérifier
            </Button>

            <Pressable
              onPress={() => {
                setMfaRequired(false);
                setMfaCode("");
              }}
              style={styles.link}
            >
              <Text style={styles.linkText}>Retour</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + spacing["3xl"] },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.brand}>
            <Text style={styles.brandName}>OpsFlux</Text>
            <Text style={styles.brandTagline}>Opérations terrain</Text>
          </View>

          <Text style={styles.title}>Connexion</Text>
          <Text style={styles.subtitle}>
            Accédez à votre espace OpsFlux
          </Text>

          <TextInput
            mode="outlined"
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          <TextInput
            mode="outlined"
            label="Mot de passe"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            right={
              <TextInput.Icon
                icon={showPassword ? "eye-off-outline" : "eye-outline"}
                onPress={() => setShowPassword((s) => !s)}
              />
            }
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
          />

          {showServerField && (
            <TextInput
              mode="outlined"
              label="URL du serveur"
              value={serverUrl}
              onChangeText={setServerUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              outlineColor={colors.border}
              activeOutlineColor={colors.primary}
            />
          )}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={loading}
            disabled={loading}
            style={styles.primaryButton}
            contentStyle={styles.primaryButtonContent}
            labelStyle={styles.primaryButtonLabel}
            buttonColor={colors.primary}
          >
            Se connecter
          </Button>

          <Pressable
            onPress={() => setShowServerField(!showServerField)}
            style={styles.link}
          >
            <Text style={styles.linkText}>
              {showServerField ? "Masquer le serveur" : "Serveur personnalisé"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["2xl"],
  },
  content: {
    maxWidth: 420,
    width: "100%",
    alignSelf: "center",
  },
  brand: {
    marginBottom: spacing["3xl"],
  },
  brandName: {
    ...typography.displayMd,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  brandTagline: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    marginTop: 2,
  },
  title: {
    ...typography.headlineLg,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    marginBottom: spacing["2xl"],
  },
  input: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
  },
  mfaInput: {
    fontSize: 24,
    letterSpacing: 6,
    textAlign: "center",
  },
  primaryButton: {
    borderRadius: radius.base,
    marginTop: spacing.md,
  },
  primaryButtonContent: {
    paddingVertical: 6,
  },
  primaryButtonLabel: {
    ...typography.titleMd,
    color: "#ffffff",
  },
  link: {
    alignItems: "center",
    marginTop: spacing.lg,
    paddingVertical: spacing.sm,
  },
  linkText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    fontWeight: "600",
  },
});
