/**
 * LoginScreen — Gluestack refonte with QR pairing option.
 *
 * Sober, modern, Linear/Stripe-inspired. Tailwind-classed via NativeWind.
 *
 * Offers three ways in:
 *   1. Email + password (classic)
 *   2. MFA challenge (when backend responds mfa_required)
 *   3. Scanner QR (WhatsApp-Web style pairing) — navigates to PairingScan.
 *
 * All strings go through t() so the server-driven i18n catalog applies.
 */

import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Box,
  Button,
  ButtonIcon,
  ButtonSpinner,
  ButtonText,
  Divider,
  FormControl,
  FormControlLabel,
  FormControlLabelText,
  HStack,
  Heading,
  Icon,
  Input,
  InputField,
  InputIcon,
  InputSlot,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Mail,
  QrCode,
  Server,
  Shield,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { login, verifyMfa } from "../services/auth";
import { useAuthStore } from "../stores/auth";
import { setBaseUrl } from "../services/api";

interface Props {
  navigation: any;
}

export default function LoginScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

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
      Alert.alert(t("common.error", "Erreur"), t("auth.missingFields", "Veuillez saisir votre email et mot de passe."));
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
        // Request all essential OS permissions up-front (best-effort)
        import("../services/permissions")
          .then((m) => m.requestEssentialPermissions())
          .catch(() => {});
      }
    } catch (err: any) {
      const message = err?.response?.data?.detail || t("auth.invalidCredentials", "Identifiants incorrects.");
      Alert.alert(t("auth.loginError", "Erreur de connexion"), message);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify() {
    if (!mfaCode.trim()) {
      Alert.alert(t("common.error", "Erreur"), t("auth.missingMfa", "Veuillez saisir le code MFA."));
      return;
    }
    setLoading(true);
    try {
      const response = await verifyMfa(mfaToken, mfaCode.trim());
      setTokens(response.access_token, response.refresh_token);
    } catch (err: any) {
      const message = err?.response?.data?.detail || t("auth.invalidMfa", "Code MFA invalide.");
      Alert.alert(t("auth.mfaError", "Erreur MFA"), message);
    } finally {
      setLoading(false);
    }
  }

  /* ── MFA challenge view ───────────────────────────────────────────── */
  if (mfaRequired) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1, backgroundColor: "#f9fafb" }}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 48 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Box flex={1} px="$5" pb="$8">
            <Box maxWidth={420} w="$full" alignSelf="center">
              <Icon as={Shield} size="xl" color="$primary600" mb="$4" />
              <Heading size="xl" mb="$1" color="$textLight900">
                {t("auth.mfaTitle", "Vérification en 2 étapes")}
              </Heading>
              <Text size="md" color="$textLight600" mb="$6">
                {t("auth.mfaSubtitle", "Saisissez le code à 6 chiffres depuis votre application d'authentification.")}
              </Text>

              <FormControl mb="$4">
                <FormControlLabel mb="$1">
                  <FormControlLabelText>{t("auth.mfaCode", "Code à 6 chiffres")}</FormControlLabelText>
                </FormControlLabel>
                <Input size="xl" borderColor="$borderLight300">
                  <InputField
                    value={mfaCode}
                    onChangeText={setMfaCode}
                    keyboardType="number-pad"
                    maxLength={6}
                    autoFocus
                    textAlign="center"
                    fontSize={24}
                    letterSpacing={6}
                    placeholder="••••••"
                  />
                </Input>
              </FormControl>

              <Button
                size="xl"
                action="primary"
                onPress={handleMfaVerify}
                isDisabled={loading || mfaCode.length < 6}
              >
                {loading && <ButtonSpinner mr="$2" />}
                <ButtonText>{t("auth.verify", "Vérifier")}</ButtonText>
              </Button>

              <Pressable
                mt="$5"
                alignItems="center"
                py="$2"
                onPress={() => {
                  setMfaRequired(false);
                  setMfaCode("");
                }}
              >
                <HStack alignItems="center" space="xs">
                  <Icon as={ArrowLeft} size="sm" color="$textLight500" />
                  <Text size="md" color="$textLight500" fontWeight="$semibold">
                    {t("common.back", "Retour")}
                  </Text>
                </HStack>
              </Pressable>
            </Box>
          </Box>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  /* ── Main login view ──────────────────────────────────────────────── */
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1, backgroundColor: "#f9fafb" }}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + 48 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Box flex={1} px="$5" pb="$8">
          <Box maxWidth={420} w="$full" alignSelf="center">
            {/* Brand */}
            <VStack mb="$8">
              <Heading size="2xl" color="$textLight900" letterSpacing={-0.5}>
                OpsFlux
              </Heading>
              <Text size="md" color="$textLight600" mt="$0.5">
                {t("auth.tagline", "Opérations terrain")}
              </Text>
            </VStack>

            {/* Heading */}
            <Heading size="xl" mb="$1" color="$textLight900">
              {t("auth.login", "Connexion")}
            </Heading>
            <Text size="md" color="$textLight600" mb="$6">
              {t("auth.loginSubtitle", "Accédez à votre espace OpsFlux")}
            </Text>

            {/* QR pairing CTA (featured) */}
            <Pressable
              onPress={() => navigation.navigate("PairingScan")}
              bg="$primary50"
              borderWidth={1}
              borderColor="$primary200"
              borderRadius="$lg"
              p="$4"
              mb="$6"
              $active-bg="$primary100"
            >
              <HStack space="md" alignItems="center">
                <Box bg="$primary100" p="$2.5" borderRadius="$lg">
                  <Icon as={QrCode} size="lg" color="$primary700" />
                </Box>
                <VStack flex={1}>
                  <Text size="md" fontWeight="$semibold" color="$primary900">
                    {t("auth.scanQr", "Scanner un QR code")}
                  </Text>
                  <Text size="sm" color="$primary700" opacity={0.8}>
                    {t("auth.scanQrHint", "Depuis app.opsflux.com → Profil → Connecter l'app mobile")}
                  </Text>
                </VStack>
              </HStack>
            </Pressable>

            {/* Divider with text */}
            <HStack alignItems="center" mb="$5" space="sm">
              <Divider flex={1} />
              <Text size="xs" color="$textLight500" fontWeight="$medium" textTransform="uppercase">
                {t("common.or", "Ou")}
              </Text>
              <Divider flex={1} />
            </HStack>

            {/* Email */}
            <FormControl mb="$3">
              <FormControlLabel mb="$1">
                <FormControlLabelText>{t("auth.email", "Email")}</FormControlLabelText>
              </FormControlLabel>
              <Input borderColor="$borderLight300">
                <InputSlot pl="$3">
                  <InputIcon as={Mail} color="$textLight400" />
                </InputSlot>
                <InputField
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="vous@exemple.com"
                />
              </Input>
            </FormControl>

            {/* Password */}
            <FormControl mb="$3">
              <FormControlLabel mb="$1">
                <FormControlLabelText>{t("auth.password", "Mot de passe")}</FormControlLabelText>
              </FormControlLabel>
              <Input borderColor="$borderLight300">
                <InputField
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="••••••••"
                />
                <InputSlot pr="$3" onPress={() => setShowPassword((s) => !s)}>
                  <InputIcon as={showPassword ? EyeOff : Eye} color="$textLight400" />
                </InputSlot>
              </Input>
            </FormControl>

            {/* Custom server (optional) */}
            {showServerField && (
              <FormControl mb="$3">
                <FormControlLabel mb="$1">
                  <FormControlLabelText>
                    {t("auth.serverUrl", "URL du serveur")}
                  </FormControlLabelText>
                </FormControlLabel>
                <Input borderColor="$borderLight300">
                  <InputSlot pl="$3">
                    <InputIcon as={Server} color="$textLight400" />
                  </InputSlot>
                  <InputField
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    keyboardType="url"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="https://api.opsflux.io"
                  />
                </Input>
              </FormControl>
            )}

            {/* Submit */}
            <Button
              size="xl"
              action="primary"
              onPress={handleLogin}
              isDisabled={loading}
              mt="$2"
            >
              {loading && <ButtonSpinner mr="$2" />}
              <ButtonText>{t("auth.signIn", "Se connecter")}</ButtonText>
            </Button>

            {/* Custom server toggle */}
            <Pressable
              mt="$5"
              alignItems="center"
              py="$2"
              onPress={() => setShowServerField(!showServerField)}
            >
              <Text size="sm" color="$textLight500" fontWeight="$semibold">
                {showServerField
                  ? t("auth.hideServer", "Masquer le serveur")
                  : t("auth.customServer", "Serveur personnalisé")}
              </Text>
            </Pressable>
          </Box>
        </Box>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
