import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
// import { Analytics } from "@vercel/analytics/next"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShell } from "@/components/app-shell"
import { FilterProvider } from "@/components/filter-context"
import { HeaderProvider } from "@/components/header-context"
import { FavoritesProvider } from "@/lib/favorites-context"
import { AuthProvider } from "@/lib/auth-context"
import { PermissionsProvider } from "@/lib/permissions-context"
import { NotificationsProvider } from "@/lib/notifications-context"
import { UIPreferencesProvider } from "@/lib/ui-preferences-context"
import { NavigationProgress } from "@/components/navigation-progress"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  title: "OpsFlux - Enterprise Application",
  description: "Professional enterprise application shell",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AuthProvider>
            <UIPreferencesProvider>
              <PermissionsProvider>
                <NotificationsProvider>
                  <FavoritesProvider>
                    <FilterProvider>
                      <HeaderProvider>
                        <AppShell>{children}</AppShell>
                      </HeaderProvider>
                    </FilterProvider>
                  </FavoritesProvider>
                </NotificationsProvider>
              </PermissionsProvider>
            </UIPreferencesProvider>
          </AuthProvider>
        </ThemeProvider>
        {/* <Analytics /> */}
      </body>
    </html>
  )
}
