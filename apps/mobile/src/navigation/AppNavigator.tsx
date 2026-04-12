/**
 * Root navigator — switches between auth flow and main app.
 *
 * Main app uses a bottom tab bar with:
 *  - Portal Home (dynamic role-based dashboard)
 *  - Scanner (ADS + Colis)
 *  - Tracking (live fleet map)
 *  - Notifications
 *  - Settings/Profile
 *
 * Each tab has its own stack for drill-down screens.
 * Shared screens (DynamicForm, detail views) are available from any tab.
 * Permissions are fetched on login and filter all visible content.
 */

import React, { useEffect, useState } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text, View, StyleSheet } from "react-native";
import { Badge } from "react-native-paper";

import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useNotifications, connectNotifications, disconnectNotifications } from "../services/notifications";
import { useOfflineStore } from "../services/offline";
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
import SearchScreen from "../screens/SearchScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import LiveTrackingScreen from "../screens/LiveTrackingScreen";
import CaptainPortalScreen from "../screens/CaptainPortalScreen";
import DriverPickupScreen from "../screens/DriverPickupScreen";
import AdsDetailScreen from "../screens/AdsDetailScreen";
import VoyageDetailScreen from "../screens/VoyageDetailScreen";
import OnboardingScreen, { isOnboardingComplete } from "../screens/OnboardingScreen";
import AccountBlockedScreen from "../screens/AccountBlockedScreen";
import ForceUpdateScreen, { compareVersions } from "../screens/ForceUpdateScreen";
import { useAppState } from "../stores/appState";
import { APP_VERSION } from "../services/api";
import MaintenanceScreen from "../screens/MaintenanceScreen";
import MyComplianceScreen from "../screens/MyComplianceScreen";
import MyContactsScreen from "../screens/MyContactsScreen";
import PreferencesScreen from "../screens/PreferencesScreen";
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

function HomeTabIcon({ focused }: { focused: boolean }) {
  const isOnline = useOfflineStore((s) => s.isOnline);
  return (
    <View>
      <TabIcon label="H" focused={focused} />
      <View
        style={[
          tabStyles.connectDot,
          { backgroundColor: isOnline ? colors.success : colors.danger },
        ]}
      />
    </View>
  );
}

function NotifTabIcon({ focused }: { focused: boolean }) {
  const unreadCount = useNotifications((s) => s.unreadCount);
  return (
    <View>
      <TabIcon label="N" focused={focused} />
      {unreadCount > 0 && (
        <Badge size={16} style={tabStyles.badge}>
          {unreadCount > 9 ? "9+" : unreadCount}
        </Badge>
      )}
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
  badge: {
    position: "absolute",
    top: -2,
    right: -6,
    backgroundColor: colors.danger,
  },
  connectDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
});

// ── Shared screens injected into each stack ─────────────────────────

function SharedScreens() {
  return (
    <>
      <Stack.Screen
        name="DynamicForm"
        component={DynamicFormScreen}
        options={({ route }: any) => ({
          title: route.params?.formTitle ?? "Formulaire",
        })}
      />
      <Stack.Screen
        name="AdsBoardingDetail"
        component={AdsBoardingDetailScreen}
        options={{ title: "Boarding ADS" }}
      />
      <Stack.Screen
        name="CargoDetail"
        component={CargoDetailScreen}
        options={{ title: "Détail Colis" }}
      />
      <Stack.Screen
        name="AdsList"
        component={AdsListScreen}
        options={{ title: "Avis de Séjour" }}
      />
      <Stack.Screen
        name="CargoList"
        component={CargoListScreen}
        options={{ title: "Colis" }}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: "Recherche" }}
      />
      <Stack.Screen
        name="CaptainAuth"
        component={CaptainPortalScreen}
        options={{ title: "Portail Capitaine" }}
      />
      <Stack.Screen
        name="DriverPickup"
        component={DriverPickupScreen}
        options={{ title: "Mode Ramassage" }}
      />
      <Stack.Screen
        name="AdsDetail"
        component={AdsDetailScreen}
        options={{ title: "Détail ADS" }}
      />
      <Stack.Screen
        name="VoyageDetail"
        component={VoyageDetailScreen}
        options={{ title: "Détail Voyage" }}
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
      {SharedScreens()}
    </Stack.Navigator>
  );
}

// ── Scanner Stack (ADS + Cargo) ─────────────────────────────────────

function ScannerStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="ScanAdsMain"
        component={ScanAdsScreen}
        options={{ title: "Scanner ADS" }}
      />
      <Stack.Screen
        name="ScanCargoMain"
        component={ScanCargoScreen}
        options={{ title: "Scanner Colis" }}
      />
      {SharedScreens()}
    </Stack.Navigator>
  );
}

// ── Tracking Stack ──────────────────────────────────────────────────

function TrackingStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="LiveTrackingMain"
        component={LiveTrackingScreen}
        options={{ title: "Suivi en direct" }}
      />
    </Stack.Navigator>
  );
}

// ── Notifications Stack ─────────────────────────────────────────────

function NotificationsStack() {
  return (
    <Stack.Navigator screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="NotificationsMain"
        component={NotificationsScreen}
        options={{ title: "Notifications" }}
      />
      {SharedScreens()}
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
      <Stack.Screen
        name="MyCompliance"
        component={MyComplianceScreen}
        options={{ title: "Ma conformité" }}
      />
      <Stack.Screen
        name="MyContacts"
        component={MyContactsScreen}
        options={{ title: "Mes contacts" }}
      />
      <Stack.Screen
        name="Preferences"
        component={PreferencesScreen}
        options={{ title: "Préférences" }}
      />
    </Stack.Navigator>
  );
}

// ── Main Tab Navigator ──────────────────────────────────────────────

function MainTabs() {
  const hasTracking = usePermissions((s) => s.hasAny(["travelwiz.tracking.update", "travelwiz.boarding.manage"]));

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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600" },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeStack}
        options={{
          tabBarLabel: "Accueil",
          tabBarIcon: ({ focused }) => <HomeTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Scanner"
        component={ScannerStack}
        options={{
          tabBarLabel: "Scanner",
          tabBarIcon: ({ focused }) => <TabIcon label="QR" focused={focused} />,
        }}
      />
      {hasTracking && (
        <Tab.Screen
          name="Tracking"
          component={TrackingStack}
          options={{
            tabBarLabel: "Tracking",
            tabBarIcon: ({ focused }) => <TabIcon label="GPS" focused={focused} />,
          }}
        />
      )}
      <Tab.Screen
        name="Notifications"
        component={NotificationsStack}
        options={{
          tabBarLabel: "Notifs",
          tabBarIcon: ({ focused }) => <NotifTabIcon focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStack}
        options={{
          tabBarLabel: "Profil",
          tabBarIcon: ({ focused }) => <TabIcon label="U" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

// ── Root Navigator ──────────────────────────────────────────────────

export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const fetchPermissions = usePermissions((s) => s.fetchPermissions);
  const clearPermissions = usePermissions((s) => s.clear);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // App-level blocking states
  const accountBlocked = useAppState((s) => s.accountBlocked);
  const blockReason = useAppState((s) => s.blockReason);
  const blockMessage = useAppState((s) => s.blockMessage);
  const updateRequired = useAppState((s) => s.updateRequired);
  const updateSoft = useAppState((s) => s.updateSoft);
  const requiredVersion = useAppState((s) => s.requiredVersion);
  const maintenance = useAppState((s) => s.maintenance);

  // On auth change: fetch permissions + connect notifications + check onboarding
  useEffect(() => {
    if (isAuthenticated) {
      fetchPermissions();
      connectNotifications();

      // Check if onboarding has been completed
      isOnboardingComplete().then((done) => {
        setShowOnboarding(!done);
        setOnboardingChecked(true);
      });
    } else {
      clearPermissions();
      disconnectNotifications();
      setOnboardingChecked(false);
      useAppState.getState().clear();
    }
  }, [isAuthenticated]);

  // ── Blocking screens take priority over everything ────────────────

  // Server maintenance
  if (maintenance) {
    return <MaintenanceScreen />;
  }

  // Force update required (non-dismissable)
  if (updateRequired && !updateSoft) {
    return (
      <ForceUpdateScreen
        currentVersion={APP_VERSION}
        requiredVersion={requiredVersion ?? "unknown"}
      />
    );
  }

  // Account blocked/suspended/deleted
  if (accountBlocked && isAuthenticated) {
    return (
      <AccountBlockedScreen
        reason={blockReason ?? "unknown"}
        message={blockMessage ?? undefined}
      />
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {!isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} />
      ) : showOnboarding && onboardingChecked ? (
        <Stack.Screen name="Onboarding">
          {() => <OnboardingScreen onComplete={() => setShowOnboarding(false)} />}
        </Stack.Screen>
      ) : (
        <Stack.Screen name="Main" component={MainTabs} />
      )}
    </Stack.Navigator>
  );
}
