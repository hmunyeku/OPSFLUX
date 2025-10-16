"use client"

import { useEffect, useState } from "react"
import { z } from "zod"
import { format } from "date-fns"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
// @ts-expect-error: the library doesn't support d.ts
import countryRegionData from "country-region-data/dist/data-umd"
import { CountryRegion, filterCountries } from "@/lib/filter-countries"
import { nofitySubmittedValues } from "@/lib/notify-submitted-values"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { paymentAcc, Plan } from "../data/data"
import { AddNewCard } from "./add-new-card"

interface Props {
  plan: Plan
}

const formSchema = z.object({
  country: z.string({
    required_error: "Sélectionnez un pays",
  }),
  zip_code: z.string().min(1, {
    message: "Renseignez le code postal",
  }),
  payment_method: z.string({
    required_error: "Sélectionnez un moyen de paiement",
  }),
})

export default function SubscribeDrawer({ plan }: Props) {
  const [countries, setCountries] = useState<CountryRegion[]>([])

  useEffect(() => {
    setCountries(filterCountries(countryRegionData, [], [], []))
  }, [])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      zip_code: "",
    },
  })

  function onSubmit(values: z.infer<typeof formSchema>) {
    nofitySubmittedValues(values)
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="ml-auto w-fit">Commencer l&apos;abonnement</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Résumé</SheetTitle>
          <SheetDescription>
            Début le {format(new Date(), "dd/MM/yyyy")}
          </SheetDescription>
        </SheetHeader>
        <Form {...form}>
          <form
            id="payment-subscribe-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4 py-8"
          >
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-sm">
                <p>Mensuel</p>
                <p className="font-bold tracking-tight">
                  ${plan.price.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center justify-between text-sm">
                <p>Taxes estimées</p>
                <p className="font-bold tracking-tight">$0.00</p>
              </div>
            </div>
            <Separator />
            <div className="flex items-center justify-between text-sm">
              <p>Total après la période d&apos;essai</p>
              <p className="font-bold tracking-tight">
                ${plan.price.toLocaleString()}
              </p>
            </div>
            <Separator />

            <h2 className="text-md font-bold">Adresse de facturation</h2>

            <div className="flex flex-col items-start gap-2 md:flex-row md:items-center">
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Pays</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Pays" />
                        </SelectTrigger>
                      </FormControl>

                      <SelectContent>
                        {countries.map(({ countryName, countryShortCode }) => (
                          <SelectItem
                            key={countryShortCode}
                            value={countryShortCode}
                          >
                            {countryName}
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
                name="zip_code"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Code postal</FormLabel>
                    <FormControl>
                      <Input placeholder="Code postal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-muted-foreground text-[13px] leading-none font-medium">
              *Assurez-vous que les détails correspondent à votre adresse de facturation pour un traitement fluide et précis.*
            </p>

            <Separator />

            <div className="flex items-center justify-between">
              <h2 className="text-md font-bold">Moyen de paiement</h2>
              <AddNewCard />
            </div>

            <FormField
              control={form.control}
              name="payment_method"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      value={field.value}
                      className="flex flex-col space-y-1"
                    >
                      {paymentAcc.map((payment) => (
                        <FormItem
                          key={payment.type}
                          className="flex items-center"
                        >
                          <FormControl>
                            <RadioGroupItem
                              className="peer sr-only"
                              value={payment.type}
                            />
                          </FormControl>
                          <FormLabel className="w-full cursor-pointer rounded-md border px-4 py-4 outline outline-gray-800 peer-data-[state=checked]:border-blue-600">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "h-3 w-3 rounded-full outline outline-offset-[2px]",
                                    form.getValues().payment_method ===
                                      payment.type &&
                                      "bg-blue-600 outline-blue-500"
                                  )}
                                />
                                <div className="flex flex-col items-start">
                                  <p className="text-xs font-semibold">
                                    {payment.name}
                                  </p>
                                  <p className="text-muted-foreground text-xs">
                                    ****
                                    {payment.card.toLocaleString().slice(5)}
                                  </p>
                                </div>
                              </div>
                              {<payment.icon size={20} />}
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
          </form>
        </Form>
        <SheetFooter>
          <Button
            form="payment-subscribe-form"
            type="submit"
            className="mt-5 w-full bg-blue-600 font-semibold tracking-tight text-white hover:bg-blue-700"
          >
            Commencer l&apos;abonnement
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
