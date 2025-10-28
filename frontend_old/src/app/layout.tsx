import type { Metadata } from "next"
// Force cache invalidation - 2025-10-20
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { LoadingBar } from "@/components/loading-bar"
import "./globals.css"
import "@/styles/nprogress.css"
import { Providers } from "./providers"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "OpsFlux",
  description: "OpsFlux - Plateforme de gestion opérationnelle",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} group/body antialiased`}>
        <LoadingBar />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  )
}
