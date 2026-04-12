/**
 * Skeleton loader — animated placeholders for loading states.
 *
 * Provides card, list item, and form skeleton layouts.
 */

import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { colors } from "../utils/colors";

function PulseBox({ width, height, borderRadius = 6, style }: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: colors.border,
          opacity,
        },
        style,
      ]}
    />
  );
}

/** Skeleton for a list item (card with title + subtitle). */
export function ListItemSkeleton() {
  return (
    <View style={styles.listItem}>
      <View style={styles.listItemLeft}>
        <PulseBox width="60%" height={16} />
        <PulseBox width="40%" height={12} style={{ marginTop: 8 }} />
      </View>
      <PulseBox width={60} height={24} borderRadius={12} />
    </View>
  );
}

/** Skeleton for a dashboard stat card. */
export function StatCardSkeleton() {
  return (
    <View style={styles.statCard}>
      <PulseBox width="70%" height={12} />
      <PulseBox width={60} height={28} style={{ marginTop: 8 }} />
    </View>
  );
}

/** Skeleton for a form (multiple field placeholders). */
export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <View style={styles.form}>
      {Array.from({ length: fields }).map((_, i) => (
        <View key={i} style={styles.formField}>
          <PulseBox width="30%" height={12} />
          <PulseBox width="100%" height={44} borderRadius={4} style={{ marginTop: 6 }} />
        </View>
      ))}
      <PulseBox width="100%" height={48} borderRadius={10} style={{ marginTop: 16 }} />
    </View>
  );
}

/** Skeleton for a full-page list. */
export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: items }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

/** Skeleton for the portal home dashboard. */
export function PortalSkeleton() {
  return (
    <View style={styles.portal}>
      <PulseBox width="50%" height={24} />
      <PulseBox width="70%" height={14} style={{ marginTop: 8 }} />
      <View style={styles.portalGrid}>
        {Array.from({ length: 4 }).map((_, i) => (
          <View key={i} style={styles.portalCard}>
            <PulseBox width={48} height={48} borderRadius={12} />
            <PulseBox width="80%" height={14} style={{ marginTop: 12 }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  listItemLeft: { flex: 1, marginRight: 12 },
  statCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.surface,
  },
  form: { gap: 16, padding: 20 },
  formField: {},
  list: { padding: 14 },
  portal: { padding: 20 },
  portalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginTop: 24,
  },
  portalCard: {
    width: "47%",
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 18,
  },
});
