"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Dev-only: lets reviewers preview every state of a mock screen. Not part of the product UI.
export function StateSwitcher<T extends string>({
  states,
  value,
  onChange,
}: {
  states: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="mb-4 flex items-center gap-2 overflow-x-auto overflow-y-hidden rounded-sm border border-dashed border-border p-2">
      <span className="shrink-0 text-xs font-medium text-muted-foreground">Prikaz stanja:</span>
      <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
        <TabsList>
          {states.map((s) => (
            <TabsTrigger key={s.value} value={s.value}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
