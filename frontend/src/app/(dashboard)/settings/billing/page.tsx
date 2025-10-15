import ContentSection from "../components/content-section"
import BillingForm from "./billing-form"

export default function SettingsBillingPage() {
  return (
    <ContentSection title="Facturation" desc="Gérez vos détails de paiement et votre plan.">
      <BillingForm />
    </ContentSection>
  )
}
