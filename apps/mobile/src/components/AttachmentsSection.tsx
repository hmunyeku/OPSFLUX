/**
 * AttachmentsSection — affiche les pièces jointes d'un objet polymorphe.
 *
 * Utilisée sur les écrans détail (ADS, Cargo, etc.). Liste les images
 * en grille (aperçu inline via FastImage-like async Image) et les
 * autres fichiers en liste avec une icône + nom + taille.
 *
 * Tap sur une image → ouvre le viewer système (via openPdf / Sharing
 * pour les PDF, ou un Modal plein écran pour les images).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  Badge,
  BadgeText,
  Box,
  Heading,
  HStack,
  Pressable,
  Spinner,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";
import { MIcon } from "./MIcon";
import {
  listAttachments,
  attachmentDownloadUrl,
  type Attachment,
} from "../services/attachments";
import { useAuthStore } from "../stores/auth";

interface Props {
  ownerType: string;
  ownerId: string;
}

function isImage(att: Attachment): boolean {
  return att.content_type.startsWith("image/");
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsSection({ ownerType, ownerId }: Props) {
  const { t } = useTranslation();
  const { accessToken } = useAuthStore();
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewAtt, setPreviewAtt] = useState<Attachment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listAttachments(ownerType, ownerId);
      setAttachments(list);
    } catch {
      setAttachments([]);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
        <HStack space="sm" alignItems="center">
          <Spinner size="small" color="$primary600" />
          <Text size="sm" color="$textLight500">
            {t("attachments.loading", "Chargement des fichiers…")}
          </Text>
        </HStack>
      </Box>
    );
  }

  if (!attachments || attachments.length === 0) {
    return null;
  }

  const images = attachments.filter(isImage);
  const files = attachments.filter((a) => !isImage(a));

  return (
    <Box bg="$white" borderRadius="$lg" borderWidth={1} borderColor="$borderLight200" p="$4">
      <HStack space="sm" alignItems="center" mb="$3">
        <MIcon name="attachment" size="sm" color="$textLight600" />
        <Heading size="xs" color="$textLight500" textTransform="uppercase" letterSpacing={0.5}>
          {t("attachments.title", "Pièces jointes")} ({attachments.length})
        </Heading>
      </HStack>

      {images.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: files.length ? 12 : 0 }}>
          <HStack space="sm">
            {images.map((img) => (
              <Pressable key={img.id} onPress={() => setPreviewAtt(img)}>
                <Image
                  source={{
                    uri: attachmentDownloadUrl(img.id),
                    headers: { Authorization: `Bearer ${accessToken}` },
                  }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              </Pressable>
            ))}
          </HStack>
        </ScrollView>
      )}

      {files.length > 0 && (
        <VStack>
          {files.map((f, idx) => (
            <Pressable
              key={f.id}
              onPress={() => setPreviewAtt(f)}
              py="$2.5"
              borderTopWidth={idx === 0 ? 0 : 1}
              borderColor="$borderLight100"
            >
              <HStack space="sm" alignItems="center">
                <Box bg="$primary50" borderRadius="$md" p="$2">
                  <MIcon
                    name={f.content_type === "application/pdf" ? "picture-as-pdf" : "insert-drive-file"}
                    size="sm"
                    color="$primary700"
                  />
                </Box>
                <VStack flex={1}>
                  <Text size="sm" fontWeight="$medium" color="$textLight900" numberOfLines={1}>
                    {f.original_name}
                  </Text>
                  <Text size="2xs" color="$textLight500">
                    {formatBytes(f.size_bytes)}
                  </Text>
                </VStack>
                {f.description && (
                  <Badge action="muted" variant="outline" size="sm">
                    <BadgeText>{f.description}</BadgeText>
                  </Badge>
                )}
              </HStack>
            </Pressable>
          ))}
        </VStack>
      )}

      {/* Full-screen image preview */}
      <Modal
        visible={previewAtt !== null && isImage(previewAtt)}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewAtt(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPreviewAtt(null)}>
          {previewAtt && (
            <Image
              source={{
                uri: attachmentDownloadUrl(previewAtt.id),
                headers: { Authorization: `Bearer ${accessToken}` },
              }}
              style={styles.modalImage}
              resizeMode="contain"
            />
          )}
          <View style={styles.modalCloseWrap} pointerEvents="none">
            <Box bg="rgba(0,0,0,0.5)" borderRadius="$full" p="$2">
              <MIcon name="close" size="md" color="#ffffff" />
            </Box>
          </View>
        </Pressable>
      </Modal>
    </Box>
  );
}

const styles = StyleSheet.create({
  thumbnail: {
    width: 110,
    height: 110,
    borderRadius: 8,
    backgroundColor: "#f1f5f9",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalImage: {
    width: "100%",
    height: "100%",
  },
  modalCloseWrap: {
    position: "absolute",
    top: 40,
    right: 20,
  },
});
