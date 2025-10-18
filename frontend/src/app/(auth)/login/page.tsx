"use client"

import { Card } from "@/components/ui/card"
import { UserAuthForm } from "./components/user-auth-form"
import { useTranslation } from "@/hooks/use-translation"

export default function LoginPage() {
  const { t } = useTranslation("core.auth")

  return (
    <Card className="p-6">
      <div className="flex flex-col space-y-2 text-center mb-4">
        <p className="text-muted-foreground text-sm">
          {t("login.subtitle")}
        </p>
      </div>
      <UserAuthForm />
      <p className="text-muted-foreground mt-4 px-8 text-center text-sm">
        {t("login.terms_text")}{" "}
        <a
          href="/terms"
          className="hover:text-primary underline underline-offset-4"
        >
          {t("login.terms_link")}
        </a>{" "}
        {t("login.terms_and")}{" "}
        <a
          href="/privacy"
          className="hover:text-primary underline underline-offset-4"
        >
          {t("login.privacy_link")}
        </a>
        .
      </p>
    </Card>
  )
}
