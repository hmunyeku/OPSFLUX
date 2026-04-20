/**
 * MOCAttachmentsSection — typed photo uploader for the MOC detail
 * screen. The user picks a category (PID initial, PID modifié, photo
 * terrain…) and captures or picks an image; the upload fires through
 * the offline-aware queue.
 *
 * Read-side — a small scrollable list shows previously uploaded
 * attachments so the user can tell what's already attached. No delete
 * on mobile (too easy to mis-tap); deletion stays web-only.
 */

import React, { useCallback, useEffect, useState } from "react";
import { Alert, Image, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  Badge,
  BadgeText,
  Box,
  Button,
  ButtonIcon,
  ButtonSpinner,
  ButtonText,
  HStack,
  Heading,
  Pressable,
  Text,
  VStack,
} from "@gluestack-ui/themed";
import { useTranslation } from "react-i18next";
import { MIcon } from "./MIcon";
import {
  listAttachments,
  uploadAttachment,
  type Attachment,
} from "../services/attachments";

type MOCAttachmentCategory =
  | "pid_initial"
  | "pid_modified"
  | "esd_initial"
  | "esd_modified"
  | "photo"
  | "study"
  | "other";

const CATEGORY_VALUES: MOCAttachmentCategory[] = [
  "pid_initial",
  "pid_modified",
  "esd_initial",
  "esd_modified",
  "photo",
  "study",
  "other",
];

interface Props {
  mocId: string;
}

export default function MOCAttachmentsSection({ mocId }: Props) {
  const { t } = useTranslation();
  const categoryLabel = (v: string) => t(`moc.attachment.category.${v}`, { defaultValue: v });
  const [items, setItems] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState<MOCAttachmentCategory>("photo");

  const reload = useCallback(async () => {
    try {
      const list = await listAttachments("moc", mocId);
      setItems(list);
    } catch {
      /* silent — list isn't critical */
    } finally {
      setLoading(false);
    }
  }, [mocId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const pick = useCallback(
    async (source: "camera" | "library") => {
      const perm =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          t("moc.attachment.permTitle"),
          source === "camera"
            ? t("moc.attachment.permCamera")
            : t("moc.attachment.permGallery"),
        );
        return;
      }
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              quality: 0.8,
            });
      if (result.canceled || result.assets.length === 0) return;

      setUploading(true);
      try {
        const { uri } = result.assets[0];
        const res = await uploadAttachment(
          uri,
          "moc",
          mocId,
          categoryLabel(category),
          category,
        );
        if (res.queued) {
          Alert.alert(
            t("moc.attachment.offlineTitle"),
            t("moc.attachment.queued"),
          );
        } else if (!res.success) {
          Alert.alert(t("moc.attachment.uploadFailed"), res.error ?? t("moc.attachment.unknownError"));
        }
        reload();
      } finally {
        setUploading(false);
      }
    },
    [category, mocId, reload, t],
  );

  return (
    <Box
      bg="$white"
      borderRadius="$lg"
      borderWidth={1}
      borderColor="$borderLight200"
      p="$3"
      mb="$2"
    >
      <Heading size="sm" mb="$2">
        {t("moc.section.attachments")}
      </Heading>

      {/* Category chips — pick the type, then snap / pick a file */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 12 }}
      >
        <HStack space="sm">
          {CATEGORY_VALUES.map((v) => (
            <Pressable
              key={v}
              onPress={() => setCategory(v)}
              bg={category === v ? "$primary600" : "$white"}
              borderWidth={1}
              borderColor={
                category === v ? "$primary600" : "$borderLight200"
              }
              px="$3"
              py="$1.5"
              borderRadius="$full"
            >
              <Text
                size="xs"
                fontWeight="$semibold"
                color={category === v ? "$white" : "$textLight700"}
              >
                {categoryLabel(v)}
              </Text>
            </Pressable>
          ))}
        </HStack>
      </ScrollView>

      {/* Actions */}
      <HStack space="sm" mb="$2">
        <Button
          flex={1}
          size="sm"
          action="primary"
          isDisabled={uploading}
          onPress={() => pick("camera")}
        >
          {uploading ? <ButtonSpinner mr="$2" /> : null}
          <ButtonIcon as={MIcon as any} />
          <ButtonText>{t("moc.action.camera")}</ButtonText>
        </Button>
        <Button
          flex={1}
          size="sm"
          variant="outline"
          action="secondary"
          isDisabled={uploading}
          onPress={() => pick("library")}
        >
          <ButtonText>{t("moc.action.gallery")}</ButtonText>
        </Button>
      </HStack>

      {/* List */}
      {loading ? (
        <Text size="xs" color="$textLight400">
          {t("moc.attachment.loading")}
        </Text>
      ) : items.length === 0 ? (
        <Text size="xs" color="$textLight400" fontStyle="italic">
          {t("moc.attachment.empty")}
        </Text>
      ) : (
        <VStack space="xs">
          {items.map((a) => (
            <HStack
              key={a.id}
              alignItems="center"
              space="sm"
              py="$1.5"
              borderBottomWidth={1}
              borderBottomColor="$borderLight100"
            >
              {a.content_type.startsWith("image/") ? (
                <Image
                  source={{
                    uri: `data:${a.content_type};base64,`,
                  }}
                  // Fallback placeholder — we don't download thumbnails on
                  // mobile to save bandwidth. Caller can tap to open.
                  style={{ width: 32, height: 32, borderRadius: 4 }}
                />
              ) : (
                <MIcon name="description" size="sm" color="$textLight500" />
              )}
              <VStack flex={1}>
                <Text size="xs" fontWeight="$medium" numberOfLines={1}>
                  {a.original_name}
                </Text>
                <HStack space="xs" alignItems="center">
                  {(a as Attachment & { category?: string }).category && (
                    <Badge action="info" variant="outline" size="sm">
                      <BadgeText>
                        {categoryLabel(
                          (a as Attachment & { category?: string })
                            .category as string,
                        )}
                      </BadgeText>
                    </Badge>
                  )}
                  <Text size="2xs" color="$textLight400">
                    {Math.round(a.size_bytes / 1024)} ko
                  </Text>
                </HStack>
              </VStack>
            </HStack>
          ))}
        </VStack>
      )}
    </Box>
  );
}
