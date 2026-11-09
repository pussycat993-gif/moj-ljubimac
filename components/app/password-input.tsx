"use client"

import { useState, type ComponentProps } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

// PasswordInput (QA Q1) — the Input of S15, S16 and S28 with a show/hide toggle inside the field.
// The toggle is an icon button (aria-pressed); its label switches between "show" and "hide".

// labels:start — FR-35: the toggle's accessible names, defaulting to today's Serbian copy.
export type PasswordInputLabels = { show: string; hide: string }

export const defaultPasswordInputLabels: PasswordInputLabels = {
  show: "Prikaži lozinku",
  hide: "Sakrij lozinku",
}
// labels:end

export function PasswordInput({
  className,
  labels = defaultPasswordInputLabels,
  disabled,
  ...props
}: Omit<ComponentProps<typeof Input>, "type"> & { labels?: PasswordInputLabels }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} disabled={disabled} type={visible ? "text" : "password"} className={cn("pr-11", className)} />
      <button
        type="button"
        aria-label={visible ? labels.hide : labels.show}
        aria-pressed={visible}
        aria-controls={props.id}
        disabled={disabled}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}
