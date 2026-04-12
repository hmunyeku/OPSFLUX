/**
 * Responsive layout hooks — adapts UI for phone vs tablet.
 *
 * Uses screen dimensions to determine layout breakpoints.
 * Re-renders on orientation change.
 */

import { useState, useEffect } from "react";
import { Dimensions, ScaledSize } from "react-native";

export type DeviceType = "phone" | "tablet";
export type Orientation = "portrait" | "landscape";

interface ResponsiveInfo {
  /** "phone" if shortest dimension < 600, else "tablet" */
  deviceType: DeviceType;
  orientation: Orientation;
  /** Current screen width */
  width: number;
  /** Current screen height */
  height: number;
  /** True when on tablet in landscape — use side-by-side layout */
  isWideLayout: boolean;
  /** Number of columns for grid layouts */
  gridColumns: number;
  /** Content padding based on screen size */
  contentPadding: number;
  /** Card width for grid items */
  cardWidth: number;
}

function computeResponsiveInfo(window: ScaledSize): ResponsiveInfo {
  const { width, height } = window;
  const shortest = Math.min(width, height);
  const deviceType: DeviceType = shortest >= 600 ? "tablet" : "phone";
  const orientation: Orientation = width > height ? "landscape" : "portrait";
  const isWideLayout = deviceType === "tablet" && orientation === "landscape";

  let gridColumns: number;
  if (width >= 1024) {
    gridColumns = 4;
  } else if (width >= 768) {
    gridColumns = 3;
  } else if (width >= 480) {
    gridColumns = 2;
  } else {
    gridColumns = 2;
  }

  const contentPadding = deviceType === "tablet" ? 24 : 14;
  const availableWidth = width - contentPadding * 2;
  const gap = 14;
  const cardWidth =
    (availableWidth - gap * (gridColumns - 1)) / gridColumns;

  return {
    deviceType,
    orientation,
    width,
    height,
    isWideLayout,
    gridColumns,
    contentPadding,
    cardWidth,
  };
}

export function useResponsive(): ResponsiveInfo {
  const [info, setInfo] = useState<ResponsiveInfo>(() =>
    computeResponsiveInfo(Dimensions.get("window"))
  );

  useEffect(() => {
    function handleChange({
      window,
    }: {
      window: ScaledSize;
      screen: ScaledSize;
    }) {
      setInfo(computeResponsiveInfo(window));
    }

    const subscription = Dimensions.addEventListener("change", handleChange);
    return () => subscription.remove();
  }, []);

  return info;
}

/**
 * Returns a value based on device type.
 * Usage: const padding = useDeviceValue({ phone: 14, tablet: 24 })
 */
export function useDeviceValue<T>(values: {
  phone: T;
  tablet: T;
}): T {
  const { deviceType } = useResponsive();
  return deviceType === "tablet" ? values.tablet : values.phone;
}
