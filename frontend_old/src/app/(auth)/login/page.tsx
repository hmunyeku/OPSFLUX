"use client"

import { useSearchParams } from "next/navigation"
import { Card } from "@/components/ui/card"
import { UserAuthForm } from "./components/user-auth-form"
import { useTranslation } from "@/hooks/use-translation"

export default function LoginPage() {
  const { t } = useTranslation("core.auth")
  const searchParams = useSearchParams()
  const redirectUrl = searchParams.get("redirect") || undefined

  return (
    <Card className="p-6">
      <div className="flex flex-col space-y-2 text-center mb-4">
        <p className="text-muted-foreground text-sm">
          {t("login.subtitle", "Connectez-vous à votre compte")}
        </p>
      </div>
      <UserAuthForm redirectUrl={redirectUrl} />
      <p className="text-muted-foreground mt-4 px-8 text-center text-sm">
        {t("login.terms_text", "En continuant, vous acceptez nos")}{" "}
        <a
          href="/terms"
          className="hover:text-primary underline underline-offset-4"
        >
          {t("login.terms_link", "Conditions d'utilisation")}
        </a>{" "}
        {t("login.terms_and", "et notre")}{" "}
        <a
          href="/privacy"
          className="hover:text-primary underline underline-offset-4"
        >
          {t("login.privacy_link", "Politique de confidentialité")}
        </a>
        .
      </p>
    </Card>
  )
}
