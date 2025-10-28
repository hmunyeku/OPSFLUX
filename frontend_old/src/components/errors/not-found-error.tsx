"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { IconError404, IconHome, IconArrowLeft, IconSearch } from "@tabler/icons-react"
import { Button } from "../ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../ui/card"

export default function NotFoundError() {
  const router = useRouter()

  return (
    <div className="flex h-svh items-center justify-center p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/10 ring-8 ring-blue-500/5">
            <IconError404 className="h-10 w-10 text-blue-500" />
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">404</CardTitle>
          <CardDescription className="text-base mt-2">
            Oups ! Page introuvable
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 px-6">
          <div className="rounded-lg bg-muted/50 p-4 border">
            <p className="text-sm text-muted-foreground text-center">
              Il semble que la page que vous recherchez n'existe pas ou a été supprimée.
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950">
            <p className="text-sm text-blue-800 dark:text-blue-200 text-center flex items-center justify-center gap-2">
              <IconSearch className="h-4 w-4" />
              Vérifiez l'URL ou retournez à l'accueil
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
