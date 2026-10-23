import { getVisitorLocale } from "@/lib/actions/registration"
import { getDictionary } from "@/lib/i18n"
import { PrivacyClient } from "./privacy-client"

// S30 Politika privatnosti · /privatnost · public (no sign-in) · language from the ml_locale cookie.
export default async function PrivacyPage() {
  const dict = getDictionary(await getVisitorLocale())
  return (
    <PrivacyClient page={dict.privacy} legal={dict.legal} shellLabels={dict.shell.public} intro={dict.privacy.intro} />
  )
}
