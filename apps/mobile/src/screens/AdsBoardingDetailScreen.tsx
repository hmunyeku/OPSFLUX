/**
 * ADS Boarding Detail screen.
 *
 * Shows the full boarding context for a scanned ADS QR:
 *  - ADS summary (reference, site, dates, purpose)
 *  - Passenger list with boarding status toggle
 *  - Progress bar for boarded vs total
 */

import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, statusColors } from "../utils/colors";
import StatusBadge from "../components/StatusBadge";
import { updateAdsBoardingPassenger } from "../services/paxlog";
import type { AdsBoardingContext, AdsBoardingPassenger } from "../types/api";

interface Props {
  route: {
    params: {
      context: AdsBoardingContext;
      token: string;
    };
  };
}

export default function AdsBoardingDetailScreen({ route }: Props) {
  const { token } = route.params;
  const [ctx, setCtx] = useState<AdsBoardingContext>(route.params.context);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const allPassengers = [
    ...ctx.manifests.flatMap((m) =>
      m.passengers.map((p) => ({ ...p, _voyageRef: m.voyage_reference }))
    ),
    ...ctx.declared_pax.map((p) => ({ ...p, _voyageRef: "Déclarés" })),
    ...ctx.unassigned_pax.map((p) => ({ ...p, _voyageRef: "Non assignés" })),
  ];

  const boardedCount = allPassengers.filter(
    (p) => p.boarding_status === "boarded"
  ).length;
  const progress = allPassengers.length
    ? boardedCount / allPassengers.length
    : 0;

  const toggleBoarding = useCallback(
    async (passenger: AdsBoardingPassenger & { _voyageRef: string }) => {
      const newStatus =
        passenger.boarding_status === "boarded" ? "pending" : "boarded";

      setUpdatingId(passenger.id);
      try {
        const updated = await updateAdsBoardingPassenger(
          token,
          passenger.id,
          newStatus
        );

        // Update local state with the response
        setCtx((prev) => {
          const updatePax = (p: AdsBoardingPassenger): AdsBoardingPassenger =>
            p.id === passenger.id
              ? {
                  ...p,
                  boarding_status: updated.boarding_status,
                  boarded_at: updated.boarded_at,
                }
              : p;

          return {
            ...prev,
            pax_boarded:
              newStatus === "boarded"
                ? prev.pax_boarded + 1
                : prev.pax_boarded - 1,
            manifests: prev.manifests.map((m) => ({
              ...m,
              passengers: m.passengers.map(updatePax),
            })),
            declared_pax: prev.declared_pax.map(updatePax),
            unassigned_pax: prev.unassigned_pax.map(updatePax),
          };
        });
      } catch (err: any) {
        Alert.alert(
          "Erreur",
          err?.response?.data?.detail || "Impossible de mettre à jour le statut."
        );
      } finally {
        setUpdatingId(null);
      }
    },
    [token]
  );

  const renderPassenger = ({
    item,
  }: {
    item: AdsBoardingPassenger & { _voyageRef: string };
  }) => {
    const isBoarded = item.boarding_status === "boarded";
    const isUpdating = updatingId === item.id;

    return (
      <Pressable
        style={[styles.paxCard, isBoarded && styles.paxCardBoarded]}
        onPress={() => toggleBoarding(item)}
        disabled={isUpdating}
      >
        <View style={styles.paxLeft}>
          <Text style={styles.paxName}>{item.display_name}</Text>
          {item.badge_number && (
            <Text style={styles.paxBadge}>Badge: {item.badge_number}</Text>
          )}
          {item.company_name && (
            <Text style={styles.paxCompany}>{item.company_name}</Text>
          )}
          <Text style={styles.paxVoyage}>{item._voyageRef}</Text>
        </View>
        <View style={styles.paxRight}>
          {isUpdating ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              <StatusBadge status={item.boarding_status} />
              {!item.compliance_ok && (
                <Text style={styles.complianceWarning}>Non conforme</Text>
              )}
            </>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* ADS Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.reference}>{ctx.ads_reference}</Text>
          <StatusBadge status={ctx.status} size="md" />
        </View>
        <Text style={styles.siteName}>{ctx.site_name}</Text>
        <Text style={styles.dates}>
          {ctx.start_date} — {ctx.end_date}
        </Text>
        <Text style={styles.purpose} numberOfLines={2}>
          {ctx.visit_purpose}
        </Text>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.progressText}>
            {boardedCount}/{allPassengers.length} embarqués
          </Text>
        </View>
      </View>

      {/* Passenger list */}
      <FlatList
        data={allPassengers}
        keyExtractor={(item) => item.id}
        renderItem={renderPassenger}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Aucun passager trouvé.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  reference: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  siteName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 2,
  },
  dates: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  purpose: {
    fontSize: 13,
    color: colors.textSecondary,
    fontStyle: "italic",
    marginBottom: 12,
  },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textPrimary,
    minWidth: 80,
    textAlign: "right",
  },
  listContent: {
    padding: 14,
    gap: 8,
  },
  paxCard: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  paxCardBoarded: {
    borderLeftWidth: 4,
    borderLeftColor: colors.success,
  },
  paxLeft: {
    flex: 1,
  },
  paxRight: {
    justifyContent: "center",
    alignItems: "flex-end",
    gap: 4,
  },
  paxName: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textPrimary,
  },
  paxBadge: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  paxCompany: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  paxVoyage: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 3,
  },
  complianceWarning: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: "600",
  },
  emptyText: {
    textAlign: "center",
    color: colors.textMuted,
    fontSize: 15,
    marginTop: 40,
  },
});
