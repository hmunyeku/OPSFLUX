"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { Shield, Home, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"

export default function ForbiddenPage() {
  const router = useRouter()

  return (
    <div className="flex h-full items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
            <Shield className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Accès refusé</CardTitle>
          <CardDescription className="text-base">
            Vous n&apos;avez pas les permissions nécessaires pour accéder à cette page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg bg-muted p-4">
            <h3 className="font-semibold mb-2">Pourquoi je vois cette page ?</h3>
            <ul className="space-y-1 text-sm text-muted-foreground">
              <li>• Vous n&apos;avez pas les permissions requises</li>
              <li>• Votre rôle ne permet pas d&apos;accéder à cette ressource</li>
              <li>• Cette page est réservée aux administrateurs</li>
            </ul>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950">
            <p className="text-sm text-amber-800 dark:text-amber-200">
              Si vous pensez que c&apos;est une erreur, veuillez contacter votre administrateur système.
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
            Retour
          </Button>
          <Button
            asChild
            className="flex-1"
          >
            <Link href="/">
              <Home className="mr-2 h-4 w-4" />
              Accueil
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
