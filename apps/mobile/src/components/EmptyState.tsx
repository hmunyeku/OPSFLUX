/**
 * EmptyState — illustrated empty view for lists & detail screens.
 *
 * Uses an UnDraw-style SVG illustration (or a falling-back MIcon if a
 * specific illustration isn't passed) for a friendlier "nothing here"
 * screen. Same Gluestack button + typography for the action.
 */

import React from "react";
import { StyleSheet, View } from "react-native";
import { Button, ButtonText, Text } from "@gluestack-ui/themed";
import { MIcon, type MIconName } from "./MIcon";
import {
  EmptyInbox,
  NoConnection,
  NoResults,
  type IllustrationProps,
} from "./illustrations";

type IllustrationKind = "inbox" | "no-results" | "offline" | "icon";

interface Props {
  /**
   * Which illustration to render.
   *  - "inbox": empty list of items
   *  - "no-results": search returned nothing
   *  - "offline": no network
   *  - "icon": use the legacy MIcon-in-circle (back-compat, default)
   */
  illustration?: IllustrationKind;
  /** Used when illustration === "icon". */
  icon?: MIconName;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const ILLUS_MAP: Record<
  Exclude<IllustrationKind, "icon">,
  React.FC<IllustrationProps>
> = {
  inbox: EmptyInbox,
  "no-results": NoResults,
  offline: NoConnection,
};

export default function EmptyState({
  illustration = "icon",
  icon = "inbox",
  title,
  description,
  actionLabel,
  onAction,
}: Props) {
  const Illus = illustration !== "icon" ? ILLUS_MAP[illustration] : null;

  return (
    <View style={styles.container}>
      {Illus ? (
        <Illus width={180} />
      ) : (
        <View style={styles.iconCircle}>
          <MIcon name={icon} size="xl" color="$primary400" />
        </View>
      )}
      <Text
        size="md"
        fontWeight="$semibold"
        color="$textLight900"
        style={styles.title}
        mt="$5"
      >
        {title}
      </Text>
      {description && (
        <Text size="sm" color="$textLight500" style={styles.description}>
          {description}
        </Text>
      )}
      {actionLabel && onAction && (
        <Button action="primary" onPress={onAction} mt="$5" size="md">
          <ButtonText>{actionLabel}</ButtonText>
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    paddingTop: 40,
  },
  iconCircle: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: "#eff6ff",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    textAlign: "center",
  },
  description: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
    maxWidth: 280,
  },
});
