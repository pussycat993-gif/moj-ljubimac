import Link from "next/link"
import { Eye } from "lucide-react"
import { Card } from "@/components/ui/card"

export function ReadOnlyBanner({ reason, action }: { reason: string; action?: { href: string; label: string } }) {
  return (
    <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
      <Eye className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 text-sm">{reason}</p>
      {action && (
        <Link href={action.href} className="ml-auto shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline">
          {action.label}
        </Link>
      )}
    </Card>
  )
}
