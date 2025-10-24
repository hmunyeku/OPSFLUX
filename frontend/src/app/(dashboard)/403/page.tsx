"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconShieldOff, IconHome, IconArrowLeft, IconAlertTriangle } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function ForbiddenPage() {
  const router = useRouter()

  return (
    <div className="flex h-full items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/10 ring-8 ring-red-500/5">
            <IconShieldOff className="h-10 w-10 text-red-500" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">403</CardTitle>
          <CardDescription className="text-base mt-2">
            Accès interdit
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6">
          <div className="rounded-lg bg-muted/50 p-4 border">
            <h3 className="font-semibold mb-2 text-sm">Pourquoi cette erreur ?</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Vous n'avez pas les permissions nécessaires</li>
              <li>• Votre rôle ne permet pas cette action</li>
              <li>• Cette ressource est restreinte</li>
            </ul>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm text-red-800 dark:text-red-200 text-center flex items-center justify-center gap-2">
              <IconAlertTriangle className="h-4 w-4" />
              Contactez l'administrateur si nécessaire
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex gap-2 px-6 pb-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => router.back()}
          >
            <IconArrowLeft className="mr-2 h-4 w-4" />
            Retour
          </Button>
          <Button
            asChild
            className="flex-1"
          >
            <Link href="/">
              <IconHome className="mr-2 h-4 w-4" />
              Accueil
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
