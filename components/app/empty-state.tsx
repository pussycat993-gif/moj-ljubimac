import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  onAction,
  href,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: string
  onAction?: () => void
  href?: string
}) {
  return (
    <Card className="items-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && href && (
        <Button asChild className="h-11 md:h-9">
          <Link href={href}>{action}</Link>
        </Button>
      )}
      {action && !href && (
        <Button className="h-11 md:h-9" onClick={onAction}>
          {action}
        </Button>
      )}
    </Card>
  )
}
