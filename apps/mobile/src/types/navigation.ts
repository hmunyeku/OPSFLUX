/**
 * Type-safe navigation param lists for all stacks and tabs.
 */

import type { AdsBoardingContext, CargoRead, CargoTrackingRead } from "./api";
import type { FormDefinition } from "./forms";

// ── Root ──────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Main: undefined;
  Login: undefined;
};

// ── Main Tabs ─────────────────────────────────────────────────────────

export type MainTabParamList = {
  Home: undefined;
  Scanner: undefined;
  Tracking: undefined;
  Notifications: undefined;
  Settings: undefined;
};

// ── Shared Screens (available in multiple stacks) ─────────────────────

export type SharedParamList = {
  DynamicForm: { formId: string; formTitle?: string; formDef?: FormDefinition };
  AdsBoardingDetail: { context: AdsBoardingContext; token: string };
  CargoDetail: { tracking: CargoTrackingRead; trackingCode: string; cargo?: CargoRead };
  AdsList: { status?: string; scope?: string; highlightId?: string };
  CargoList: { status?: string; highlightId?: string };
  Search: undefined;
  CaptainAuth: undefined;
  DriverPickup: undefined;
};

// ── Home Stack ────────────────────────────────────────────────────────

export type HomeStackParamList = {
  PortalHome: undefined;
} & SharedParamList;

// ── Scanner Stack ─────────────────────────────────────────────────────

export type ScannerStackParamList = {
  ScanAdsMain: undefined;
  ScanCargoMain: undefined;
} & SharedParamList;

// ── Tracking Stack ────────────────────────────────────────────────────

export type TrackingStackParamList = {
  LiveTrackingMain: undefined;
};

// ── Notifications Stack ───────────────────────────────────────────────

export type NotificationsStackParamList = {
  NotificationsMain: undefined;
} & SharedParamList;

// ── Settings Stack ────────────────────────────────────────────────────

export type SettingsStackParamList = {
  SettingsMain: undefined;
};
