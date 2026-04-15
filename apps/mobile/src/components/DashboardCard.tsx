/**
 * Dashboard stat card — fetches a stat from a server endpoint.
 *
 * Clean Gluestack card with soft shadow, uppercase micro-label, big
 * primary-coloured value. Consistent with the rest of the portal.
 */

import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Text } from "@gluestack-ui/themed";
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
        if (card.display === "total" && typeof data?.total === "number") {
          setValue(data.total);
        } else if (
          card.display === "count" &&
          typeof data?.items?.length === "number"
        ) {
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
    <View style={styles.card}>
      <Text
        size="2xs"
        color="$textLight500"
        textTransform="uppercase"
        letterSpacing={0.5}
        fontWeight="$medium"
      >
        {card.title}
      </Text>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={colors.primary}
          style={styles.loader}
        />
      ) : (
        <Text
          size="3xl"
          color="$primary700"
          fontWeight="$bold"
          mt="$1"
        >
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 14,
    padding: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  loader: { marginTop: 8, alignSelf: "flex-start" },
});
