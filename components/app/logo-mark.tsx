import Image from "next/image"
import { cn } from "@/lib/utils"

// Official Moj Ljubimac logo (dog + cat silhouette, brand brown = the --primary token).
// Files live in /public/brand (copied from 04-design/assets).
//   variant "mark"       — silhouette only (phone top bar, favicon-size uses)
//   variant "horizontal" — silhouette + wordmark side by side (public header)
//   variant "full"       — silhouette above wordmark (auth screens w-48, AppShell sidebar w-36)
export function LogoMark({
  variant = "horizontal",
  className,
}: {
  variant?: "mark" | "horizontal" | "full"
  className?: string
}) {
  if (variant === "full") {
    return (
      <Image
        src="/brand/logo-full.png"
        alt="Moj Ljubimac"
        width={783}
        height={643}
        priority
        className={cn("h-auto w-48", className)}
      />
    )
  }
  const mark = (
    <Image
      src="/brand/logo-mark.png"
      alt={variant === "mark" ? "Moj Ljubimac" : ""}
      width={498}
      height={498}
      priority
      className="size-9 shrink-0"
    />
  )
  if (variant === "mark") return <span className={cn("inline-flex", className)}>{mark}</span>
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      {mark}
      <Image
        src="/brand/logo-wordmark.png"
        alt="Moj Ljubimac"
        width={759}
        height={136}
        priority
        className="h-auto w-36 min-w-0"
      />
    </span>
  )
}
