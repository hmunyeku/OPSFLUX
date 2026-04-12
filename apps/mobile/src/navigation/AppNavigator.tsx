/**
 * Root navigator — switches between auth flow and main app.
 *
 * Main app uses a bottom tab bar with:
 *  - Portal Home (dynamic role-based dashboard)
 *  - Scanner ADS
 *  - Scanner Colis
 *  - Settings/Profile
 *
 * Each tab has its own stack for drill-down screens.
 * The DynamicForm screen is accessible from any tab via a shared stack.
 */

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet } from "react-native";

import { useAuthStore } from "../stores/auth";
import { colors } from "../utils/colors";

// Screens
import LoginScreen from "../screens/LoginScreen";
import PortalHomeScreen from "../screens/PortalHomeScreen";
import ScanAdsScreen from "../screens/ScanAdsScreen";
import ScanCargoScreen from "../screens/ScanCargoScreen";
import AdsBoardingDetailScreen from "../screens/AdsBoardingDetailScreen";
import CargoDetailScreen from "../screens/CargoDetailScreen";
import AdsListScreen from "../screens/AdsListScreen";
import CargoListScreen from "../screens/CargoListScreen";
import DynamicFormScreen from "../screens/DynamicFormScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const defaultScreenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: "600" as const },
};

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={[tabStyles.icon, focused && tabStyles.iconFocused]}>
      <Text style={[tabStyles.iconText, focused && tabStyles.iconTextFocused]}>
        {label}
      </Text>
    </View>
  );
}

const tabStyles = StyleSheet.create({
  icon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  iconFocused: {
    backgroundColor: colors.primary + "15",
  },
  iconText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.textMuted,
  },
  iconTextFocused: {
    color: colors.primary,
  },
});

// ── Shared screens injected into each stack ─────────────────────────

function withSharedScreens(StackNav: typeof Stack) {
  return (
    <>
      <StackNav.Screen
        name="DynamicForm"
        component={DynamicFormScreen}
        options={({ route }: any) => ({
          title: route.params?.formTitle ?? "Formulaire",
        })}
      />
      <StackNav.Screen
        name="AdsBoardingDetail"
        component={AdsBoardingDetailScreen}
        options={{ title: "Boarding ADS" }}
      />
      <StackNav.Screen
        name="CargoDetail"
        component={CargoDetailScreen}
        options={{ title: "Détail Colis" }}
      />
      <StackNav.Screen
        name="AdsList"
        component={AdsListScreen}
        options={{ title: "Avis de Séjour" }}
      />
      <StackNav.Screen
        name="CargoList"
        component={CargoListScreen}
        options={{ title: "Colis" }}
      />
    </>
  );
}

// ── Home Stack (Portal) ─────────────────────────────────────────────

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="PortalHome"
        component={PortalHomeScreen}
        options={{ title: "OpsFlux" }}
      />
      {withSharedScreens(Stack)}
    </Stack.Navigator>
  );
}

// ── ADS Scanner Stack ───────────────────────────────────────────────

function AdsStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="ScanAdsMain"
        component={ScanAdsScreen}
        options={{ title: "Scanner ADS" }}
      />
      {withSharedScreens(Stack)}
    </Stack.Navigator>
  );
}

// ── Cargo Scanner Stack ─────────────────────────────────────────────

function CargoStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="ScanCargoMain"
        component={ScanCargoScreen}
        options={{ title: "Scanner Colis" }}
      />
      {withSharedScreens(Stack)}
    </Stack.Navigator>
  );
}

// ── Settings Stack ──────────────────────────────────────────────────

function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="SettingsMain"
        component={SettingsScreen}
        options={{ title: "Paramètres" }}
      />
    </Stack.Navigator>
  );
}

// ── Main Tab Navigator ──────────────────────────────────────────────

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarLabel: "Accueil",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="H" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ScanAds"
        component={AdsStack}
        options={{
          tabBarLabel: "Scan ADS",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="QR" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="ScanCargo"
        component={CargoStack}
        options={{
          tabBarLabel: "Scan Colis",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="PKG" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          tabBarLabel: "Profil",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="U" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

// ── Root Navigator ──────────────────────────────────────────────────

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}
