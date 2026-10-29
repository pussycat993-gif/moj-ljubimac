import type { Metadata } from "next"
import MessagesPage from "../page"

// S36 Poruke · /poruke/[id] — the same view as /poruke with this conversation open (Step 28c).

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Poruke · Moj Ljubimac" }

export default MessagesPage
