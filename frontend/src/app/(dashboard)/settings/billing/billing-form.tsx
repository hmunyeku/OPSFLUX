"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { IconApple, IconBrandPaypal } from "@tabler/icons-react"
import { zodResolver } from "@hookform/resolvers/zod"
import { nofitySubmittedValues } from "@/lib/notify-submitted-values"
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const formSchema = z.object({
  username: z.string().min(1, {
    message: "Le nom d'utilisateur est requis.",
  }),
  city: z.string().min(1, {
    message: "La ville est requise.",
  }),
  payment_method: z.enum(["Card", "Paypal", "Apple"], {
    required_error: "La méthode de paiement est requise.",
  }),
  card_number: z.string().min(1, {
    message: "Le numéro de carte est requis.",
  }),
  expire: z.string({
    required_error: "La date d'expiration est requise.",
  }),
  year: z.string({
    required_error: "L'année est requise.",
  }),
  cv: z.string().min(1, {
    message: "Le CVV est requis.",
  }),
})

export default function BillingForm() {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      username: "",
      city: "",
      card_number: "",
      cv: "",
      payment_method: "Card",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    nofitySubmittedValues(values)
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="mb-4xx grid grid-cols-6 gap-5"
      >
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem className="col-span-6 md:col-span-3">
              <FormLabel>Nom d&apos;utilisateur</FormLabel>
              <FormControl>
                <Input placeholder="Entrez le nom d'utilisateur" {...field} />
              </FormControl>
              <FormDescription>Votre nom d&apos;utilisateur.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="city"
          render={({ field }) => (
            <FormItem className="col-span-6 md:col-span-3">
              <FormLabel>Ville</FormLabel>
              <FormControl>
                <Input placeholder="Entrez la ville" {...field} />
              </FormControl>
              <FormDescription>Le nom de votre ville.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="payment_method"
          render={({ field }) => (
            <FormItem className="col-span-6">
              <FormLabel>Paiement</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                  className="grid grid-cols-3 gap-4"
                >
                  <FormItem className="col-span-1 flex items-center">
                    <FormControl>
                      <RadioGroupItem
                        value="Card"
                        id="card"
                        className="peer sr-only"
                        aria-label="Carte"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor="card"
                      className="border-muted hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex flex-1 flex-col items-center justify-between rounded-md border-2 bg-transparent p-4"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        className="mb-3 h-6 w-6"
                      >
                        <rect width="20" height="14" x="2" y="5" rx="2" />
                        <path d="M2 10h20" />
                      </svg>
                      Carte
                    </FormLabel>
                  </FormItem>
                  <FormItem className="col-span-1 flex items-center">
                    <FormControl>
                      <RadioGroupItem
                        value="Paypal"
                        id="paypal"
                        className="peer sr-only"
                        aria-label="Paypal"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor="paypal"
                      className="border-muted hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex flex-1 flex-col items-center justify-between rounded-md border-2 bg-transparent p-4"
                    >
                      <IconBrandPaypal className="mb-3 h-6 w-6" />
                      Paypal
                    </FormLabel>
                  </FormItem>
                  <FormItem className="col-span-1 flex items-center">
                    <FormControl>
                      <RadioGroupItem
                        value="Apple"
                        id="apple"
                        className="peer sr-only"
                        aria-label="Apple"
                      />
                    </FormControl>
                    <FormLabel
                      htmlFor="apple"
                      className="border-muted hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary flex flex-1 flex-col items-center justify-between rounded-md border-2 bg-transparent p-4"
                    >
                      <IconApple className="mb-3 h-6 w-6" />
                      Apple
                    </FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="card_number"
          render={({ field }) => (
            <FormItem className="col-span-6">
              <FormLabel>Numéro de carte</FormLabel>
              <FormControl>
                <Input placeholder="Entrez le numéro de carte" {...field} />
              </FormControl>
              <FormDescription>Le numéro de votre carte.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="expire"
          render={({ field }) => (
            <FormItem className="col-span-3 md:col-span-2">
              <FormLabel>Expiration</FormLabel>
              <FormControl>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <SelectTrigger id="month" aria-label="Mois">
                    <SelectValue placeholder="Mois" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Janvier</SelectItem>
                    <SelectItem value="2">Février</SelectItem>
                    <SelectItem value="3">Mars</SelectItem>
                    <SelectItem value="4">Avril</SelectItem>
                    <SelectItem value="5">Mai</SelectItem>
                    <SelectItem value="6">Juin</SelectItem>
                    <SelectItem value="7">Juillet</SelectItem>
                    <SelectItem value="8">Août</SelectItem>
                    <SelectItem value="9">Septembre</SelectItem>
                    <SelectItem value="10">Octobre</SelectItem>
                    <SelectItem value="11">Novembre</SelectItem>
                    <SelectItem value="12">Décembre</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>La date d&apos;expiration de votre carte.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="year"
          render={({ field }) => (
            <FormItem className="col-span-3 md:col-span-2">
              <FormLabel>Année</FormLabel>
              <FormControl>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  value={field.value}
                >
                  <SelectTrigger id="year" aria-label="Année">
                    <SelectValue placeholder="Année" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 10 }, (_, i) => (
                      <SelectItem
                        key={i}
                        value={`${new Date().getFullYear() + i}`}
                      >
                        {new Date().getFullYear() + i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormDescription>L&apos;année d&apos;expiration de votre carte.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="cv"
          render={({ field }) => (
            <FormItem className="col-span-6 md:col-span-2">
              <FormLabel>CVV</FormLabel>
              <FormControl>
                <Input {...field} id="cvc" placeholder="CVV" />
              </FormControl>
              <FormDescription>Le code de sécurité de votre carte.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button className="col-span-6" type="submit">
          Continuer
        </Button>
      </form>
    </Form>
  )
}
