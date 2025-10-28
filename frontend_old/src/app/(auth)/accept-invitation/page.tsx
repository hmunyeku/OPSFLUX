import Link from "next/link"
import { Suspense } from "react"
import { Card } from "@/components/ui/card"
import { AcceptInvitationForm } from "./components/accept-invitation-form"

function AcceptInvitationPageContent() {
  return (
    <Card className="p-6">
      <div className="mb-6 flex flex-col space-y-2 text-left">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bienvenue !
        </h1>
        <p className="text-muted-foreground text-sm">
          Vous avez été invité à rejoindre l'équipe. Créez votre compte pour commencer.
        </p>
      </div>
      <AcceptInvitationForm />
      <p className="text-muted-foreground mt-6 px-8 text-center text-sm">
        Vous avez déjà un compte ?{" "}
        <Link
          href="/login"
          className="hover:text-primary underline underline-offset-4"
        >
          Se connecter
        </Link>
        .
      </p>
    </Card>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div>Chargement...</div>}>
      <AcceptInvitationPageContent />
    </Suspense>
  )
}
