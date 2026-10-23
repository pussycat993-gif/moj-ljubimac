import { CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

// labels:start — FR-35: the button text, defaulting to today's Serbian copy; the app passes the dictionary's label.
export type ErrorStateLabels = { retry: string }

export const defaultErrorStateLabels: ErrorStateLabels = { retry: "Pokušaj ponovo" }
// labels:end

export function ErrorState({
  message = "Nešto nije u redu. Pokušaj ponovo.",
  onRetry,
  labels = defaultErrorStateLabels,
}: {
  message?: string
  onRetry?: () => void
  labels?: ErrorStateLabels
}) {
  return (
    <Card role="alert" className="items-center gap-3 p-8 text-center">
      <CircleAlert className="size-6 text-destructive" aria-hidden />
      <p className="text-sm">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        {labels.retry}
      </Button>
    </Card>
  )
}
