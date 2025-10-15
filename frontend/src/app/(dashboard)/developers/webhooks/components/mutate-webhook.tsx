"use client"

import { Dispatch, SetStateAction, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import {
  Webhook,
  webhookAuthTypeSchema,
  webhookEventSchema,
} from "../data/schema"
import { webhookEvents } from "../data/webhook-data"
import { createWebhook, updateWebhook } from "../data/webhooks-api"

interface Props {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  currentWebhook?: Webhook
  onWebhookMutated?: () => void
}

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  url: z
    .string()
    .min(1, "L'URL est requise.")
    .url("Veuillez entrer une URL valide"),
  description: z.string().optional(),
  authType: webhookAuthTypeSchema,
  events: z
    .array(webhookEventSchema)
    .refine((value) => value.some((item) => item), {
      message: "Veuillez sélectionner au moins un événement",
    }),
})
type MutateWebhookForm = z.infer<typeof formSchema>

export function MutateWebhook({ open, setOpen, currentWebhook, onWebhookMutated }: Props) {
  const isEdit = !!currentWebhook
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<MutateWebhookForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentWebhook
      ? {
          name: currentWebhook.name,
          url: currentWebhook.url,
          description: currentWebhook.description || "",
          authType: currentWebhook.authType,
          events: currentWebhook.events,
        }
      : {
          name: "",
          url: "",
          description: "",
          authType: "none",
          events: [],
        },
  })

  const onSubmit = async (data: MutateWebhookForm) => {
    setIsSubmitting(true)
    try {
      if (isEdit && currentWebhook) {
        await updateWebhook(currentWebhook.id, {
          name: data.name,
          url: data.url,
          description: data.description,
          auth_type: data.authType,
          events: data.events,
        })
        toast({
          title: "Webhook mis à jour",
          description: "Le webhook a été mis à jour avec succès",
        })
      } else {
        await createWebhook({
          name: data.name,
          url: data.url,
          description: data.description,
          auth_type: data.authType,
          events: data.events,
        })
        toast({
          title: "Webhook créé",
          description: "Le webhook a été créé avec succès",
        })
      }
      setOpen(false)
      form.reset()
      onWebhookMutated?.()
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Une erreur s'est produite",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(e) => {
        form.clearErrors()
        setOpen(e)
      }}
    >
      <SheetContent className="flex w-full max-w-none flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Update" : "New"} Webhook</SheetTitle>
          <SheetDescription>
            {isEdit ? "Configure" : "Setup"} your webhook endpoint to receive
            live events.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="webhook"
            onSubmit={form.handleSubmit(onSubmit)}
            className="no-scrollbar -mx-2 flex-1 space-y-5 overflow-y-auto p-2"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Mon webhook" disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="url"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>URL Endpoint</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="https://" disabled={isSubmitting} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="An optional description of what this webhook endpoint is used for..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authType"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Type</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="grid grid-cols-3"
                    >
                      {["none", "application", "platform"].map((item) => (
                        <FormItem
                          key={item}
                          className="flex items-center space-y-0 space-x-3"
                        >
                          <FormLabel
                            className={cn(
                              "border-border flex h-full w-full items-start gap-2 rounded-lg border px-2 py-4 font-normal capitalize sm:p-4",
                              "[&:has([aria-checked=true])]:border-foreground [&_circle]:fill-foreground [&_circle]:stroke-transparent",
                              "flex flex-col sm:flex-row [&_button]:size-4"
                            )}
                          >
                            <FormControl>
                              <RadioGroupItem value={item} />
                            </FormControl>
                            <div className="w-full overflow-hidden text-ellipsis">
                              {item}
                            </div>
                          </FormLabel>
                        </FormItem>
                      ))}
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="events"
              render={() => (
                <FormItem className="space-y-1">
                  <FormLabel>Events</FormLabel>
                  <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                    {webhookEvents.map((whEvent) => (
                      <FormField
                        key={whEvent}
                        control={form.control}
                        name="events"
                        render={({ field }) => {
                          return (
                            <FormItem key={whEvent}>
                              <FormLabel
                                className={cn(
                                  "flex flex-row items-start space-y-0 space-x-2",
                                  "border-border rounded-lg border p-4",
                                  "[&:has([aria-checked=true])]:border-btse-500",
                                  "[&_button[aria-checked=true]]:bg-btse-500 [&_button[aria-checked=true]]:border-btse-500",
                                  "[&:has(button[aria-invalid=true])]:border-destructive [&_button[aria-invalid=true]]:border-destructive"
                                )}
                              >
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(whEvent)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([
                                            ...field.value,
                                            whEvent,
                                          ])
                                        : field.onChange(
                                            field.value?.filter(
                                              (value) => value !== whEvent
                                            )
                                          )
                                    }}
                                  />
                                </FormControl>
                                <div className="font-medium capitalize">
                                  {whEvent}
                                </div>
                              </FormLabel>
                            </FormItem>
                          )
                        }}
                      />
                    ))}
                  </div>
                  <FormMessage className="sm:col-span-2 sm:col-start-2" />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <SheetFooter className="gap-2">
          <SheetClose asChild>
            <Button variant="outline" disabled={isSubmitting}>Annuler</Button>
          </SheetClose>
          <Button form="webhook" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
