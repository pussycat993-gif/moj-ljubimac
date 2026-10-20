import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type Status = "done" | "soon" | "missed" | "today" | "premium"

const styles: Record<Status, string> = {
  done: "border-transparent bg-success-soft text-foreground",
  soon: "border-transparent bg-warning-soft text-foreground",
  missed: "border-transparent bg-destructive-soft text-foreground",
  today: "border-transparent bg-primary text-primary-foreground",
  premium: "border-primary bg-card text-primary",
}

const labels: Record<Status, string> = {
  done: "Urađeno",
  soon: "Uskoro",
  missed: "Propušteno",
  today: "Danas",
  premium: "Premium",
}

// Pastel status pills (design v1.4): done/soon/missed use the -soft status surfaces with
// `text-foreground` (computed 11.5–13:1). Never put the deep success/warning/destructive colour
// as text on its soft fill. "Danas" is solid primary, "Premium" a primary outline.
// Status is never colour-only — the pill always carries its label.
export function StatusBadge({ status, label, className }: { status: Status; label?: string; className?: string }) {
  return <Badge className={cn("rounded-full", styles[status], className)}>{label ?? labels[status]}</Badge>
}
