"use client"

import { useState } from "react"
import { z } from "zod"
import { format } from "date-fns"
import { useForm } from "react-hook-form"
import { CalendarIcon } from "@radix-ui/react-icons"
import {
  IconCreditCard,
  IconCreditCardPay,
  IconPlus,
} from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogClose,
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const formSchema = z.object({
  card_number: z.string().min(1, {
    message: "Le numéro de carte est requis.",
  }),
  cardholder_name: z.string().min(1, {
    message: "Le nom du titulaire est requis.",
  }),
  expireDate: z.coerce.date({ required_error: "La date d'expiration est requise." }),
  cvv: z.string().min(1, {
    message: "Le CVV est requis.",
  }),
  billing_address: z.string().min(1, {
    message: "L'adresse de facturation est requise.",
  }),
})

export function AddNewCard() {
  const [opened, setOpened] = useState(false)

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      card_number: "",
      cardholder_name: "",
      cvv: "",
      billing_address: "",
    },
  })

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    form.reset()
    toast({
      title: "Vous avez soumis les valeurs suivantes :",
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(values, null, 2)}</code>
        </pre>
      ),
    })
    setOpened(false)
  }

  return (
    <Dialog
      open={opened}
      onOpenChange={() => {
        form.reset()
        setOpened((prev) => !prev)
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="link"
          className="flex items-center gap-1 font-semibold text-blue-600"
        >
          <IconPlus size={16} />
          <span className="text-xs">Ajouter une carte</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="flex items-center gap-2">
            <IconCreditCard /> Nouveau paiement
          </DialogTitle>
          <DialogDescription>
            Assurez-vous que les informations sont exactes pour traiter la transaction en douceur.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            id="add-new-card-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="grid grid-cols-6 gap-5"
          >
            <FormField
              control={form.control}
              name="cardholder_name"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>Titulaire de la carte</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Nom du titulaire" {...field} />
                  </FormControl>
                  <FormDescription>Renseignez le nom du titulaire</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="card_number"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>Numéro de carte</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Numéro de carte" {...field} />
                  </FormControl>
                  <FormDescription>Renseignez le numéro de carte</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="expireDate"
              render={({ field }) => (
                <FormItem className="col-span-6">
                  <FormLabel>Date d&apos;expiration</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={"outline"}
                          className={cn(
                            "w-full pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: require('date-fns/locale/fr') })
                          ) : (
                            <span>Choisir une date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) =>
                          date > new Date() || date < new Date("1900-01-01")
                        }
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormDescription>Choisissez la date d&apos;expiration.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cvv"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>CVV</FormLabel>
                  <FormControl>
                    <Input placeholder="CVV" {...field} />
                  </FormControl>
                  <FormDescription>Renseignez le CVV</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="billing_address"
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel>Adresse de facturation</FormLabel>
                  <FormControl>
                    <Input placeholder="Adresse de facturation" {...field} />
                  </FormControl>
                  <FormDescription>Renseignez l&apos;adresse de facturation</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
        <DialogFooter className="gap-y-2">
          <DialogClose asChild>
            <Button variant="outline">Annuler</Button>
          </DialogClose>
          <Button type="submit" form="add-new-card-form">
            Enregistrer <IconCreditCardPay />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
