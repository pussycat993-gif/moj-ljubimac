"use client"

import Link from "next/link"
import { Mail, MessageCircle, Smartphone } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PetSex } from "@/components/app/pet-avatar"
import { ReminderTypeIcon, type ReminderType } from "@/components/app/reminder-type-icon"
import { StatusBadge, type Status } from "@/components/app/status-badge"

export type Channel = "email" | "push" | "whatsapp"

const channelIcon = { email: Mail, push: Smartphone, whatsapp: MessageCircle } as const
const channelLabel = { email: "Mejl", push: "Push", whatsapp: "WhatsApp" } as const

export type ReminderRowData = {
  id: string
  title: string
  when: string
  status: Status
  channels: Channel[]
  type?: ReminderType
  pet?: { name: string; sex: PetSex }
  /** When set, the title links here — manual reminders open S11 in edit mode (`/podsetnici/[id]`). */
  href?: string
}

export function ReminderRow({ reminder, onDone }: { reminder: ReminderRowData; onDone?: (id: string) => void }) {
  return (
    <div className="flex items-center gap-3 rounded-sm bg-foreground/5 p-3">
      <ReminderTypeIcon type={reminder.type} sex={reminder.pet?.sex} forMe={!reminder.pet} />
      <div className="min-w-0 flex-1">
        {reminder.href ? (
          <Link
            href={reminder.href}
            className="block truncate rounded-sm text-sm font-medium hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {reminder.title}
          </Link>
        ) : (
          <p className="truncate text-sm font-medium">{reminder.title}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{reminder.pet ? reminder.pet.name : "Za mene"}</span>
          <span aria-hidden>·</span>
          <span>{reminder.when}</span>
          <span className="flex items-center gap-1">
            {reminder.channels.map((c) => {
              const Icon = channelIcon[c]
              return <Icon key={c} className="size-3.5" aria-label={channelLabel[c]} />
            })}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={reminder.status} className="hidden sm:inline-flex" />
        {reminder.status !== "done" && (
          <Button size="sm" variant="outline" onClick={() => onDone?.(reminder.id)}>
            Urađeno
          </Button>
        )}
      </div>
    </div>
  )
}
