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
import { MaterialIcons } from "@expo/vector-icons";
// Custom mini-badge replacing react-native-paper.Badge for notif counts.
function MiniBadge({ children }: { children: React.ReactNode }) {
  return (
    <View style={tabStyles.badge}>
      <Text style={tabStyles.badgeText}>{children}</Text>
    </View>
  );
}
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuthStore } from "../stores/auth";
import { usePermissions } from "../stores/permissions";
import { useNotifications, connectNotifications, disconnectNotifications } from "../services/notifications";
import { useOfflineStore } from "../services/offline";
import { colors } from "../utils/colors";

// Screens
import LoginScreen from "../screens/LoginScreen";
import PairingScanScreen from "../screens/PairingScanScreen";
import VerificationsHubScreen from "../screens/verifications/VerificationsHubScreen";
import PhoneVerificationScreen from "../screens/verifications/PhoneVerificationScreen";
import EmailVerificationScreen from "../screens/verifications/EmailVerificationScreen";
import LocationVerificationScreen from "../screens/verifications/LocationVerificationScreen";
import IdDocumentVerificationScreen from "../screens/verifications/IdDocumentVerificationScreen";
import PortalHomeScreen from "../screens/PortalHomeScreen";
import ScanAdsScreen from "../screens/ScanAdsScreen";
import SmartScanScreen from "../screens/SmartScanScreen";
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
import MyPickupWaitingScreen from "../screens/MyPickupWaitingScreen";
import CargoScanAssistantScreen from "../screens/CargoScanAssistantScreen";
import CargoRequestDetailScreen from "../screens/CargoRequestDetailScreen";
import AdsDetailScreen from "../screens/AdsDetailScreen";
import MOCListScreen from "../screens/MOCListScreen";
import MOCDetailScreen from "../screens/MOCDetailScreen";
import VoyageDetailScreen from "../screens/VoyageDetailScreen";
import CargoReceptionScreen from "../screens/CargoReceptionScreen";
import OnboardingScreen, { isOnboardingComplete } from "../screens/OnboardingScreen";
import AppTopBar from "../components/AppTopBar";
import AccountBlockedScreen from "../screens/AccountBlockedScreen";
import ForceUpdateScreen, { compareVersions } from "../screens/ForceUpdateScreen";
import { useAppState } from "../stores/appState";
import { APP_VERSION } from "../services/api";
import MaintenanceScreen from "../screens/MaintenanceScreen";
import MyComplianceScreen from "../screens/MyComplianceScreen";
import MyContactsScreen from "../screens/MyContactsScreen";
import MyProfileScreen from "../screens/MyProfileScreen";
import PreferencesScreen from "../screens/PreferencesScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const defaultScreenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textInverse,
  headerTitleStyle: { fontWeight: "600" as const },
};

type TabIconName = React.ComponentProps<typeof MaterialIcons>["name"];

/**
 * Tab icon with a subtle pill background when focused. Uses the
 * MaterialIcons glyph font directly (via @expo/vector-icons) — the
 * previous implementation shipped ASCII placeholders ("H", "QR", "GPS"…)
 * which appeared as literal letters in the tab bar because no icon
 * component was ever rendered.
 */
function TabIcon({
  icon,
  focused,
}: {
  icon: TabIconName;
  focused: boolean;
}) {
  return (
    <View style={[tabStyles.icon, focused && tabStyles.iconFocused]}>
      <MaterialIcons
        name={icon}
        size={22}
        color={focused ? colors.primary : colors.textMuted}
      />
    </View>
  );
}

function HomeTabIcon({ focused }: { focused: boolean }) {
  const isOnline = useOfflineStore((s) => s.isOnline);
  return (
    <View>
      <TabIcon icon="home" focused={focused} />
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
      <TabIcon icon="notifications" focused={focused} />
      {unreadCount > 0 && (
        <MiniBadge>{unreadCount > 9 ? "9+" : unreadCount}</MiniBadge>
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
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: colors.surface,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
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
        component={DynamicFormScreen as any}
        options={({ route }: any) => ({
          title: route.params?.formTitle ?? "Formulaire",
        })}
      />
      <Stack.Screen
        name="AdsBoardingDetail"
        component={AdsBoardingDetailScreen as any}
        options={{ title: "Boarding ADS" }}
      />
      <Stack.Screen
        name="CargoDetail"
        component={CargoDetailScreen as any}
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
        component={AdsDetailScreen as any}
        options={{ title: "Détail ADS" }}
      />
      <Stack.Screen
        name="MOCList"
        component={MOCListScreen as any}
        options={{ title: "MOCtrack" }}
      />
      <Stack.Screen
        name="MOCDetail"
        component={MOCDetailScreen as any}
        options={{ title: "Détail MOC" }}
      />
      <Stack.Screen
        name="VoyageDetail"
        component={VoyageDetailScreen as any}
        options={{ title: "Détail Voyage" }}
      />
      <Stack.Screen
        name="CargoReception"
        component={CargoReceptionScreen as any}
        options={{ title: "Réception Colis" }}
      />
      <Stack.Screen
        name="MyPickupWaiting"
        component={MyPickupWaitingScreen as any}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CargoScanAssistant"
        component={CargoScanAssistantScreen as any}
        options={{ title: "Scan Colis" }}
      />
      <Stack.Screen
        name="CargoRequestDetail"
        component={CargoRequestDetailScreen as any}
        options={{ title: "Lettre de Transport" }}
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
        options={{
          // Use the persistent AppTopBar (with avatar / portal switcher /
          // search / notifications) instead of a generic React Navigation
          // header — matches the look of every modern mobile app.
          header: () => <AppTopBar showPortalSwitcher />,
        }}
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
        name="SmartScan"
        component={SmartScanScreen}
        options={{ title: "Scanner" }}
      />
      <Stack.Screen
        name="ScanAds"
        component={ScanAdsScreen}
        options={{ title: "Scanner ADS" }}
      />
      <Stack.Screen
        name="ScanCargo"
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
        name="LiveTracking"
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
        name="MyProfile"
        component={MyProfileScreen}
        options={{ title: "Mon profil", animation: "slide_from_right" }}
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
      <Stack.Screen
        name="VerificationsHub"
        component={VerificationsHubScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PhoneVerification"
        component={PhoneVerificationScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="EmailVerification"
        component={EmailVerificationScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="LocationVerification"
        component={LocationVerificationScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="IdDocumentVerification"
        component={IdDocumentVerificationScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
    </Stack.Navigator>
  );
}

// ── Main Tab Navigator ──────────────────────────────────────────────

function MainTabs() {
  const hasTracking = usePermissions((s) => s.hasAny(["travelwiz.tracking.update", "travelwiz.boarding.manage"]));
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          // Explicit bottom safe-area padding so the Android gesture bar
          // never covers the tab icons.
          paddingBottom: Math.max(insets.bottom, 8),
          height: 58 + Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginBottom: 4 },
        tabBarItemStyle: { paddingTop: 6 },
        tabBarHideOnKeyboard: true,
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
          tabBarIcon: ({ focused }) => <TabIcon icon="qr-code-scanner" focused={focused} />,
        }}
        listeners={({ navigation }) => ({
          // Tapping the Scanner tab always returns the user to the
          // camera viewfinder (root of the stack). Without this, after
          // a successful scan the user would stay on the detail screen
          // and be unable to scan again from this tab.
          tabPress: () => {
            const targetState = (navigation.getState().routes.find(
              (r: any) => r.name === "Scanner"
            ) as any)?.state;
            if (targetState && targetState.index > 0) {
              navigation.navigate("Scanner", {
                screen: "SmartScan",
              });
            }
          },
        })}
      />
      {hasTracking && (
        <Tab.Screen
          name="Tracking"
          component={TrackingStack}
          options={{
            tabBarLabel: "Tracking",
            tabBarIcon: ({ focused }) => <TabIcon icon="gps-fixed" focused={focused} />,
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
          tabBarIcon: ({ focused }) => <TabIcon icon="person" focused={focused} />,
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
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="PairingScan"
            component={PairingScanScreen}
            options={{ presentation: "modal", animation: "slide_from_bottom" }}
          />
        </>
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
