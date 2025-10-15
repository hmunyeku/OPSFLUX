"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CopyButton } from "@/components/copy-button"
import { createApiKey } from "../api-keys-api"
import { useToast } from "@/hooks/use-toast"
import { Key } from "lucide-react"

const formSchema = z.object({
  keyName: z.string().min(1, {
    message: "Le nom de la clé API est requis.",
  }),
})

interface CreateApiKeyDialogProps {
  keyType: string
  environment: string
  onKeyCreated?: () => void
}

export function CreateApiKeyDialog({ keyType, environment, onKeyCreated }: CreateApiKeyDialogProps) {
  const [opened, setOpened] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { keyName: "" },
  })

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsSubmitting(true)
    try {
      const result = await createApiKey({
        name: values.keyName,
        environment,
        key_type: keyType,
      })

      setCreatedKey(result.key)
      toast({
        title: "Clé créée",
        description: "Votre clé API a été créée avec succès",
      })
      form.reset()
      onKeyCreated?.()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer la clé",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setOpened(false)
    setCreatedKey(null)
    form.reset()
  }

  return (
    <Dialog open={opened} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          Créer une clé API
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Créer une nouvelle clé API</DialogTitle>
          <DialogDescription>
            Générez une nouvelle clé API pour accéder à nos services en toute sécurité.
          </DialogDescription>
        </DialogHeader>

        {createdKey ? (
          <div className="space-y-4">
            <Alert>
              <Key className="h-4 w-4" />
              <AlertTitle>Clé créée avec succès !</AlertTitle>
              <AlertDescription>
                <span className="text-destructive font-semibold">
                  Important : Cette clé ne sera affichée qu&apos;une seule fois. Copiez-la maintenant !
                </span>
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">Votre nouvelle clé API :</label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={createdKey}
                  className="font-mono text-xs"
                />
                <CopyButton text={createdKey} />
              </div>
            </div>

            <Alert variant="destructive">
              <AlertDescription>
                Conservez cette clé en lieu sûr. Vous ne pourrez plus la voir après avoir fermé cette fenêtre.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <Form {...form}>
            <form id="new-api-key-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="keyName"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>Nom de la clé API</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Ma clé API"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  <strong>Type :</strong> {keyType === "secret" ? "Secrète" : "Publique"}
                </p>
                <p className="text-sm text-muted-foreground">
                  <strong>Environnement :</strong> {environment}
                </p>
              </div>
            </form>
          </Form>
        )}

        <DialogFooter>
          {createdKey ? (
            <Button onClick={handleClose}>Fermer</Button>
          ) : (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Annuler
              </Button>
              <Button
                form="new-api-key-form"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Création..." : "Créer"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
