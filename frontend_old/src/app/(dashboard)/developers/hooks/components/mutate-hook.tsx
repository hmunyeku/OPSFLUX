"use client"

import { Dispatch, SetStateAction, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Plus, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
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
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Hook } from "../data/schema"
import { createHook, updateHook } from "../data/hooks-api"
import { useTranslation } from "@/hooks/use-translation"

const actionTypeOptions = [
  { value: "send_notification", label: "Send Notification" },
  { value: "send_email", label: "Send Email" },
  { value: "call_webhook", label: "Call Webhook" },
  { value: "execute_code", label: "Execute Code" },
  { value: "create_task", label: "Create Task" },
]

const formSchema = z.object({
  name: z.string().min(1, "Le nom est requis."),
  event: z.string().min(1, "L'événement est requis."),
  description: z.string().optional(),
  priority: z.coerce.number().min(0).max(999).default(10),
  is_active: z.boolean().default(true),
  conditions: z.string().optional(), // JSON string
  actions: z.array(z.object({
    type: z.enum(["send_notification", "send_email", "call_webhook", "execute_code", "create_task"]),
    config: z.string(), // JSON string
  })).min(1, "Au moins une action est requise"),
})

type MutateHookForm = z.infer<typeof formSchema>

interface Props {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  currentHook?: Hook
  onHookMutated?: () => void
}

export function MutateHook({ open, setOpen, currentHook, onHookMutated }: Props) {
  const { t } = useTranslation("core.developers")
  const isEdit = !!currentHook
  const [isSubmitting, setIsSubmitting] = useState(false)

  const form = useForm<MutateHookForm>({
    resolver: zodResolver(formSchema),
    defaultValues: currentHook
      ? {
          name: currentHook.name,
          event: currentHook.event,
          description: currentHook.description || "",
          priority: currentHook.priority,
          is_active: currentHook.is_active,
          conditions: currentHook.conditions ? JSON.stringify(currentHook.conditions, null, 2) : "",
          actions: currentHook.actions.map(a => ({
            type: a.type,
            config: JSON.stringify(a.config, null, 2),
          })),
        }
      : {
          name: "",
          event: "",
          description: "",
          priority: 10,
          is_active: true,
          conditions: "",
          actions: [{ type: "send_notification", config: "{}" }],
        },
  })

  const onSubmit = async (data: MutateHookForm) => {
    setIsSubmitting(true)
    try {
      // Parse conditions JSON
      let parsedConditions = null
      if (data.conditions && data.conditions.trim()) {
        try {
          parsedConditions = JSON.parse(data.conditions)
        } catch {
          toast({
            title: t("hooks.error", "Erreur"),
            description: "Les conditions doivent être au format JSON valide",
            variant: "destructive",
          })
          setIsSubmitting(false)
          return
        }
      }

      // Parse actions configs
      const parsedActions = data.actions.map((action, idx) => {
        try {
          return {
            type: action.type,
            config: JSON.parse(action.config),
          }
        } catch {
          throw new Error(`Action ${idx + 1}: Configuration JSON invalide`)
        }
      })

      const hookData = {
        name: data.name,
        event: data.event,
        description: data.description || undefined,
        priority: data.priority,
        is_active: data.is_active,
        conditions: parsedConditions,
        actions: parsedActions,
      }

      if (isEdit && currentHook) {
        await updateHook(currentHook.id, hookData)
        toast({
          title: t("hooks.updated", "Hook mis à jour"),
          description: t("hooks.updated_desc", "Le hook a été mis à jour avec succès"),
        })
      } else {
        await createHook(hookData)
        toast({
          title: t("hooks.created", "Hook créé"),
          description: t("hooks.created_desc", "Le hook a été créé avec succès"),
        })
      }
      setOpen(false)
      form.reset()
      onHookMutated?.()
    } catch (error) {
      toast({
        title: t("hooks.error", "Erreur"),
        description: error instanceof Error ? error.message : "Une erreur s'est produite",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const actions = form.watch("actions")

  const addAction = () => {
    form.setValue("actions", [
      ...actions,
      { type: "send_notification", config: "{}" },
    ])
  }

  const removeAction = (index: number) => {
    if (actions.length > 1) {
      form.setValue(
        "actions",
        actions.filter((_, i) => i !== index)
      )
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
      <SheetContent className="flex w-full max-w-none flex-col sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Modifier" : "Nouveau"} Hook</SheetTitle>
          <SheetDescription>
            Configurez un hook pour exécuter des actions lors d'événements système.
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="hook"
            onSubmit={form.handleSubmit(onSubmit)}
            className="no-scrollbar flex-1 space-y-5 overflow-y-auto"
          >
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-1 col-span-2">
                    <FormLabel>Nom *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Mon hook" disabled={isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="event"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Événement *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="user.created" disabled={isSubmitting} />
                    </FormControl>
                    <FormDescription>
                      Code de l'événement déclencheur
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Priorité *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={999}
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      0-999 (plus élevé = prioritaire)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="space-y-1 col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Description du hook..."
                        className="resize-none"
                        rows={2}
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="col-span-2 flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Actif</FormLabel>
                      <FormDescription>
                        Le hook est actif et s'exécutera lors des événements
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Separator />

            {/* Actions Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Actions *</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addAction}
                  disabled={isSubmitting}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Ajouter une action
                </Button>
              </div>

              {actions.map((_, index) => (
                <Card key={index}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        Action {index + 1}
                      </CardTitle>
                      {actions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAction(index)}
                          disabled={isSubmitting}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <FormField
                      control={form.control}
                      name={`actions.${index}.type`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type d'action</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                            disabled={isSubmitting}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {actionTypeOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name={`actions.${index}.config`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Configuration (JSON)</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder='{"key": "value"}'
                              className="resize-none font-mono text-xs"
                              rows={4}
                              disabled={isSubmitting}
                            />
                          </FormControl>
                          <FormDescription>
                            Configuration au format JSON
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>
              ))}
              <FormMessage>{form.formState.errors.actions?.message}</FormMessage>
            </div>

            <Separator />

            {/* Conditions Section */}
            <FormField
              control={form.control}
              name="conditions"
              render={({ field }) => (
                <FormItem className="space-y-1">
                  <FormLabel>Conditions (Optionnel)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder='{"field": "value"} ou {"field": {">": 10}}'
                      className="resize-none font-mono text-xs"
                      rows={6}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Conditions d'exécution au format JSON (laisser vide pour toujours exécuter)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <SheetFooter className="gap-2 mt-4">
          <SheetClose asChild>
            <Button variant="outline" disabled={isSubmitting}>
              Annuler
            </Button>
          </SheetClose>
          <Button form="hook" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
