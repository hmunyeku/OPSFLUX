"use client"

import { useSearchParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslation } from "@/hooks/use-translation"
import ContentSection from "../components/content-section"
import { AccountForm } from "./profile-form"
import { PreferencesTab } from "./preferences-tab"
import { InformationsTab } from "./informations-tab"
import { ApiTab } from "./api-tab"

export default function SettingsProfilePage() {
  const { t } = useTranslation("core.profile")
  const searchParams = useSearchParams()
  const tab = searchParams.get("tab", "Tab") || "profile"

  return (
    <ContentSection title={t("title", "Profile")} desc={t("description", "Manage your profile settings")} className="w-full lg:max-w-full">
      <Tabs defaultValue={tab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2">
          <TabsTrigger value="profile" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">{t("tabs.profile", "Profile")}</span>
            <span className="sm:hidden">{t("tabs.profile_mobile", "Profile")}</span>
          </TabsTrigger>
          <TabsTrigger value="preferences" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">{t("tabs.preferences", "Preferences")}</span>
            <span className="sm:hidden">{t("tabs.preferences_mobile", "Pref.")}</span>
          </TabsTrigger>
          <TabsTrigger value="informations" className="text-xs sm:text-sm">
            <span className="hidden sm:inline">{t("tabs.informations", "Informations")}</span>
            <span className="sm:hidden">{t("tabs.informations_mobile", "Info")}</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="text-xs sm:text-sm">
            {t("tabs.api", "API")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-4">
          <AccountForm />
        </TabsContent>
        <TabsContent value="preferences" className="space-y-4">
          <PreferencesTab />
        </TabsContent>
        <TabsContent value="informations" className="space-y-4">
          <InformationsTab />
        </TabsContent>
        <TabsContent value="api" className="space-y-4">
          <ApiTab />
        </TabsContent>
      </Tabs>
    </ContentSection>
  )
}
