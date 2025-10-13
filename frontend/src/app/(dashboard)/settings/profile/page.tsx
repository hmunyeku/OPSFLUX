"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ContentSection from "../components/content-section"
import { AccountForm } from "./profile-form"
import { PreferencesTab } from "./preferences-tab"
import { InformationsTab } from "./informations-tab"
import { SecurityTab } from "./security-tab"

export default function SettingsProfilePage() {
  return (
    <ContentSection title="Profil" desc="Mettez à jour les détails de votre profil et vos préférences." className="w-full lg:max-w-full">
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="security">Sécurité</TabsTrigger>
          <TabsTrigger value="preferences">Préférences</TabsTrigger>
          <TabsTrigger value="informations">Informations</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="space-y-4">
          <AccountForm />
        </TabsContent>
        <TabsContent value="security" className="space-y-4">
          <SecurityTab />
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
