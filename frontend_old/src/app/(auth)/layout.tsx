"use client"

import Image from "next/image"

interface Props {
  children: React.ReactNode
}

export default function AuthLayout({ children }: Props) {
  return (
    <div className="bg-primary-foreground container grid h-svh flex-col items-center justify-center lg:max-w-none lg:px-0">
      <div className="mx-auto flex w-full flex-col justify-center space-y-2 sm:w-[480px] lg:p-8">
        <div className="mb-6 flex items-center justify-center">
          <Image
            src="/opsflux-logo-text.svg"
            width={200}
            height={60}
            alt="OpsFlux"
            priority
          />
        </div>
        {children}
      </div>
    </div>
  )
}
