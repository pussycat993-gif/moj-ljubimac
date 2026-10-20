import { CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export function ErrorState({
  message = "Nešto nije u redu. Pokušaj ponovo.",
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <Card role="alert" className="items-center gap-3 p-8 text-center">
      <CircleAlert className="size-6 text-destructive" aria-hidden />
      <p className="text-sm">{message}</p>
      <Button variant="outline" onClick={onRetry}>
        Pokušaj ponovo
      </Button>
    </Card>
  )
}
