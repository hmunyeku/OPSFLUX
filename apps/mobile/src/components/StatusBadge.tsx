/**
 * Small colored badge showing a status label.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, statusColors } from "../utils/colors";

interface Props {
  status: string;
  label?: string;
  size?: "sm" | "md";
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Brouillon",
  submitted: "Soumis",
  pending_validation: "En attente",
  pending_compliance: "Conformité",
  approved: "Approuvé",
  rejected: "Rejeté",
  cancelled: "Annulé",
  in_progress: "En cours",
  completed: "Terminé",
  boarded: "Embarqué",
  no_show: "Absent",
  offloaded: "Débarqué",
  pending: "En attente",
  created: "Créé",
  registered: "Enregistré",
  ready: "Prêt",
  loaded: "Chargé",
  in_transit: "En transit",
  delivered: "Livré",
  delivered_final: "Livré (final)",
  received: "Reçu",
  returned: "Retourné",
  damaged: "Endommagé",
  missing: "Manquant",
  pass: "Conforme",
  fail: "Non conforme",
};

export default function StatusBadge({ status, label, size = "sm" }: Props) {
  const bgColor = statusColors[status] ?? colors.textMuted;
  const displayLabel = label ?? STATUS_LABELS[status] ?? status;

  return (
    <View style={[styles.badge, size === "md" && styles.badgeMd, { backgroundColor: bgColor + "20" }]}>
      <View style={[styles.dot, { backgroundColor: bgColor }]} />
      <Text style={[styles.text, size === "md" && styles.textMd, { color: bgColor }]}>
        {displayLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeMd: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  text: {
    fontSize: 12,
    fontWeight: "600",
  },
  textMd: {
    fontSize: 14,
  },
});
