import ContentSection from "../components/content-section"
import PlanDetail from "./plan-detail"

export default function SettingsPlansPage() {
  return (
    <ContentSection
      title="Plans"
      desc="Vos abonnements commenceront aujourd'hui avec un essai gratuit de 14 jours."
      className="lg:max-w-3xl"
    >
      <PlanDetail />
    </ContentSection>
  )
}
