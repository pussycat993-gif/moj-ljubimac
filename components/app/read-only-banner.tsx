import { Eye } from "lucide-react"
import { Card } from "@/components/ui/card"

export function ReadOnlyBanner({ reason }: { reason: string }) {
  return (
    <Card role="status" className="flex-row items-center gap-3 px-4 py-3">
      <Eye className="size-5 shrink-0 text-primary" aria-hidden />
      <p className="min-w-0 text-sm">{reason}</p>
    </Card>
  )
}
