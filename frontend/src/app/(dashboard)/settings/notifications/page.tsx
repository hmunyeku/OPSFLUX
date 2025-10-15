import ContentSection from "../components/content-section"
import { NotificationsForm } from "./notifications-form"

export default function SettingsNotificationsPage() {
  return (
    <ContentSection
      title="Notifications"
      desc="Gérez vos préférences de notifications."
    >
      <NotificationsForm />
    </ContentSection>
  )
}
