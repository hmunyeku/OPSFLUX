"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ContentSection from "../components/content-section"
import { AccountForm } from "./profile-form"
import { PreferencesTab } from "./preferences-tab"
import { InformationsTab } from "./informations-tab"

export default function SettingsProfilePage() {
  return (
    <ContentSection title="Profile" desc="Update your profile details and preferences." className="w-full lg:max-w-full">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="preferences">Préférences</TabsTrigger>
          <TabsTrigger value="informations">Informations</TabsTrigger>
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
      </Tabs>
    </ContentSection>
  )
}
