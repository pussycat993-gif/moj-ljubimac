import { getVisitorLocale } from "@/lib/actions/registration"
import { format, getDictionary } from "@/lib/i18n"
import { TERMS_VERSION } from "@/lib/legal"
import { TermsClient } from "./terms-client"

// S31 Uslovi korišćenja · /uslovi · public (no sign-in) · language from the ml_locale cookie.
// The intro shows "Verzija {TERMS_VERSION}" — the version registration stores.
export default async function TermsPage() {
  const dict = getDictionary(await getVisitorLocale())
  return (
    <TermsClient
      page={dict.terms}
      legal={dict.legal}
      shellLabels={dict.shell.public}
      intro={format(dict.terms.intro, { version: TERMS_VERSION })}
    />
  )
}
