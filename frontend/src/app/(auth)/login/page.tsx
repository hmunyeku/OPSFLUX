"use client"

import { Card } from "@/components/ui/card"
import { UserAuthForm } from "./components/user-auth-form"
import { useAppConfig } from "@/contexts/app-config-context"

export default function LoginPage() {
  const { config } = useAppConfig()

  return (
    <Card className="p-6">
      <div className="flex flex-col space-y-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion à {config.app_name}</h1>
        <p className="text-muted-foreground text-sm">
          Entrez votre email et mot de passe pour accéder à votre compte
        </p>
      </div>
      <UserAuthForm />
      <p className="text-muted-foreground mt-4 px-8 text-center text-sm">
        En vous connectant, vous acceptez nos{" "}
        <a
          href="/terms"
          className="hover:text-primary underline underline-offset-4"
        >
          Conditions d&apos;utilisation
        </a>{" "}
        et notre{" "}
        <a
          href="/privacy"
          className="hover:text-primary underline underline-offset-4"
        >
          Politique de confidentialité
        </a>
        .
      </p>
    </Card>
  )
}
