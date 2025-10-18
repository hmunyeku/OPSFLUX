"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Shield, Home, ArrowLeft } from "lucide-react"
import { useTranslation } from "@/hooks/use-translation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function ForbiddenPage() {
  const { t } = useTranslation("core.errors")
  const tCommon = useTranslation("core.common").t
  const router = useRouter()

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <Shield className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl">{t("forbidden.title")}</CardTitle>
          <CardDescription className="text-base">
            {t("forbidden.description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <h3 className="font-semibold mb-2">{t("forbidden.why_title")}</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• {t("forbidden.reason_1")}</li>
              <li>• {t("forbidden.reason_2")}</li>
              <li>• {t("forbidden.reason_3")}</li>
            </ul>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              {t("forbidden.contact_admin")}
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {tCommon("action.back")}
          </Button>
          <Button
            asChild
            className="flex-1"
          >
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              {tCommon("breadcrumb.home")}
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
