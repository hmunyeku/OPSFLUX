/**
 * Login screen — email + password, with optional MFA flow.
 * Also includes a server URL field for on-prem deployments.
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { colors } from "../utils/colors";
import { login, verifyMfa } from "../services/auth";
import { useAuthStore } from "../stores/auth";
import { setBaseUrl } from "../services/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(useAuthStore.getState().baseUrl);
  const [showServerField, setShowServerField] = useState(false);

  // MFA state
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
      // Apply custom server URL if changed
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
      const message =
        err?.response?.data?.detail || "Identifiants incorrects.";
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
        style={styles.container}
      >
        <View style={styles.card}>
          <Text style={styles.title}>Vérification MFA</Text>
          <Text style={styles.subtitle}>
            Saisissez le code depuis votre application d'authentification.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Code à 6 chiffres"
            placeholderTextColor={colors.textMuted}
            value={mfaCode}
            onChangeText={setMfaCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleMfaVerify}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.textInverse} />
            ) : (
              <Text style={styles.buttonText}>Vérifier</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMfaRequired(false);
              setMfaCode("");
            }}
          >
            <Text style={styles.link}>Retour</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <View style={styles.card}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoText}>OpsFlux</Text>
          <Text style={styles.logoSubtext}>Mobile</Text>
        </View>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <TextInput
          style={styles.input}
          placeholder="Mot de passe"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {showServerField && (
          <TextInput
            style={styles.input}
            placeholder="URL du serveur"
            placeholderTextColor={colors.textMuted}
            value={serverUrl}
            onChangeText={setServerUrl}
            keyboardType="url"
            autoCapitalize="none"
            autoCorrect={false}
          />
        )}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} />
          ) : (
            <Text style={styles.buttonText}>Se connecter</Text>
          )}
        </Pressable>

        <Pressable onPress={() => setShowServerField(!showServerField)}>
          <Text style={styles.link}>
            {showServerField ? "Masquer" : "Serveur personnalisé"}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logoText: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 1,
  },
  logoSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.textPrimary,
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceAlt,
    marginBottom: 14,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.textInverse,
    fontSize: 16,
    fontWeight: "600",
  },
  link: {
    color: colors.primaryLight,
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },
});
