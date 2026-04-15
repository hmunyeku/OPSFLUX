/**
 * Skeleton — shimmer-free simple fade loader used while fetching data.
 *
 * Simple opacity pulse animation. Prefer this to a spinner for list
 * / detail screens — gives the user a sense of the layout that's
 * about to appear.
 *
 * Usage:
 *   <Skeleton width="60%" height={18} />
 *   <SkeletonCard />    // pre-composed cargo/ads list row
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, ViewStyle } from "react-native";

interface Props {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

export default function Skeleton({
  width = "100%",
  height = 16,
  radius = 6,
  style,
}: Props) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width: width as any, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

/** Pre-composed skeleton for a list row (icon + title + subtitle). */
export function SkeletonCard() {
  return (
    <View style={cardStyles.root}>
      <Skeleton width={44} height={44} radius={10} />
      <View style={cardStyles.content}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={11} style={{ marginTop: 8 }} />
      </View>
      <Skeleton width={60} height={24} radius={12} />
    </View>
  );
}

/** Pre-composed skeleton for a detail screen — title + 4 stat rows. */
export function SkeletonDetail() {
  return (
    <View style={detailStyles.root}>
      <Skeleton width="60%" height={22} />
      <Skeleton width="80%" height={14} style={{ marginTop: 10 }} />
      <View style={detailStyles.card}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={detailStyles.row}>
            <Skeleton width={30} height={30} radius={6} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Skeleton width="40%" height={10} />
              <Skeleton width="70%" height={14} style={{ marginTop: 6 }} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: "#e2e8f0",
  },
});

const cardStyles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  content: { flex: 1 },
});

const detailStyles = StyleSheet.create({
  root: {
    padding: 14,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
});
