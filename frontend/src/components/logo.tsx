import Image from "next/image"

export function Logo({
  className = "",
  width = 32,
  height = 32,
}: {
  className?: string
  width?: number
  height?: number
}) {
  return (
    <Image
      src="/opsflux-logo.svg"
      width={width}
      height={height}
      className={className}
      alt="OpsFlux"
    />
  )
}
