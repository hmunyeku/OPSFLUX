/**
 * Home screen — dashboard with quick-action cards for scanning.
 */

import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors } from "../utils/colors";
import { useAuthStore } from "../stores/auth";

interface QuickAction {
  title: string;
  description: string;
  icon: string;
  screen: string;
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    title: "Scanner ADS",
    description: "Scanner un QR code d'Avis de Séjour pour le boarding",
    icon: "QR",
    screen: "ScanAds",
    color: colors.info,
  },
  {
    title: "Scanner Colis",
    description: "Scanner un code de tracking pour suivre un colis",
    icon: "PKG",
    screen: "ScanCargo",
    color: colors.accent,
  },
  {
    title: "Liste ADS",
    description: "Consulter les Avis de Séjour en cours",
    icon: "ADS",
    screen: "AdsList",
    color: colors.primaryLight,
  },
  {
    title: "Liste Colis",
    description: "Consulter les colis et réceptions en attente",
    icon: "BOX",
    screen: "CargoList",
    color: colors.success,
  },
  {
    title: "MOCtrack",
    description: "Consulter les demandes de modification (MOC)",
    icon: "MOC",
    screen: "MOCList",
    color: colors.info,
  },
];

interface Props {
  navigation: any;
}

export default function HomeScreen({ navigation }: Props) {
  const userDisplayName = useAuthStore((s) => s.userDisplayName);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          Bonjour{userDisplayName ? `, ${userDisplayName}` : ""}
        </Text>
        <Text style={styles.subtitle}>Que souhaitez-vous faire ?</Text>
      </View>

      <View style={styles.grid}>
        {QUICK_ACTIONS.map((action) => (
          <Pressable
            key={action.screen}
            style={styles.card}
            onPress={() => navigation.navigate(action.screen)}
          >
            <View style={[styles.iconBadge, { backgroundColor: action.color }]}>
              <Text style={styles.iconText}>{action.icon}</Text>
            </View>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardDescription}>{action.description}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
    paddingTop: 16,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  card: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  iconText: {
    color: colors.textInverse,
    fontSize: 14,
    fontWeight: "800",
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
});
