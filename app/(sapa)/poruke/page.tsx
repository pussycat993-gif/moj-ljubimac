import type { Metadata } from "next"
import { createClient } from "@/lib/supabase/server"
import type { Me } from "@/lib/actions/registration"
import type { MarketplaceStatus } from "@/lib/actions/listings"
import { getConversation, listConversations, markConversationRead, sendMessage } from "@/lib/actions/messages"
import { blockUser, submitReport, unblockUser } from "@/lib/actions/reports"
import { fromProfileLocale, getDictionary } from "@/lib/i18n"
import { MessagesClient } from "./messages-client"

// S36 Poruke · /poruke (and /poruke/[id], which renders the same view) · FR-68, FR-69, FR-70 (Step 28c). Signed in
// only (the request-interception file lists /poruke). The session decides the language (EP-43 locale) and the
// suspended state (Me.marketplace.suspended_at); the client reads EP-80 / EP-81 / EP-83 and sends EP-82 / EP-84 /
// EP-85 through the server actions passed as props (the session lives in httpOnly cookies).

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Poruke · Moj Ljubimac" }

const actions = {
  listConversations,
  getConversation,
  markConversationRead,
  sendMessage,
  submitReport,
  blockUser,
  unblockUser,
}

type SapaMe = Me & { marketplace: MarketplaceStatus | null }

/** /poruke and /poruke/[id] (whose page re-exports this one): `id` opens that conversation. */
export default async function MessagesPage({ params }: { params?: Promise<{ id?: string }> }) {
  const conversationId = (await params)?.id ?? null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_me")
  if (error) console.error("[poruke] get_me:", error.message)
  const me = (data ?? null) as SapaMe | null
  const dict = getDictionary(fromProfileLocale(me?.locale))

  return (
    <MessagesClient
      key={conversationId ?? "inbox"}
      conversationId={conversationId}
      locale={fromProfileLocale(me?.locale)}
      suspended={Boolean(me?.marketplace?.suspended_at)}
      copy={{ conversations: dict.sapa.conversations, sapa: dict.sapa.common, common: dict.common }}
      actions={actions}
    />
  )
}
