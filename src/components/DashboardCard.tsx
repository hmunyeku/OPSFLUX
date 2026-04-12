/**
 * Dashboard stat card — fetches a stat from a server endpoint and displays it.
 */

import React, { useEffect, useState } from "react";
import { StyleSheet } from "react-native";
import { ActivityIndicator, Surface, Text } from "react-native-paper";
import { fetchWithOfflineFallback } from "../services/offline";
import { colors } from "../utils/colors";
import type { DashboardCard as DashboardCardDef } from "../types/forms";

interface Props {
  card: DashboardCardDef;
}

export default function DashboardCard({ card }: Props) {
  const [value, setValue] = useState<string | number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchWithOfflineFallback<any>(
          card.endpoint,
          card.params as Record<string, unknown> | undefined
        );
        const data = result.data;
        // Extract the display value
        if (card.display === "total" && typeof data?.total === "number") {
          setValue(data.total);
        } else if (card.display === "count" && typeof data?.items?.length === "number") {
          setValue(data.items.length);
        } else if (typeof data === "number") {
          setValue(data);
        } else {
          setValue(data?.total ?? data?.count ?? "—");
        }
      } catch {
        setValue("—");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [card.endpoint]);

  return (
    <Surface style={styles.card} elevation={1}>
      <Text variant="bodySmall" style={styles.label}>
        {card.title}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.loader} />
      ) : (
        <Text variant="headlineMedium" style={styles.value}>
          {value}
        </Text>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 12,
    padding: 16,
    backgroundColor: colors.surface,
  },
  label: {
    color: colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontWeight: "700",
    color: colors.primary,
    marginTop: 4,
  },
  loader: { marginTop: 8 },
});
