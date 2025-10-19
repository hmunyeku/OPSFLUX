"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import PhoneInputWithCountry from "react-phone-number-input"
import flags from "react-phone-number-input/flags"
import "react-phone-number-input/style.css"

interface PhoneInputProps {
  value?: string
  onChange?: (value: string | undefined) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function PhoneInput({
  value,
  onChange,
  placeholder = "+1 (555) 000-0000",
  disabled,
  className,
}: PhoneInputProps) {
  return (
    <PhoneInputWithCountry
      flags={flags}
      international
      countryCallingCodeEditable={false}
      defaultCountry="US"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      inputComponent={Input}
    />
  )
}
