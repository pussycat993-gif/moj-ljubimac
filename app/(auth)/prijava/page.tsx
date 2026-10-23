import { getVisitorLocale } from "@/lib/actions/registration";
import { getDictionary } from "@/lib/i18n";
import { SignInForm } from "./sign-in-form";

// S16 Prijava · /prijava (and /prijava?view=reset for "Zaboravljena lozinka") · FR-34, EP-42
// Language: the visitor's ml_locale cookie (FR-35).
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; next?: string | string[] }>;
}) {
  const { view, next } = await searchParams;
  const dict = getDictionary(await getVisitorLocale());
  return (
    <SignInForm
      initialView={view === "reset" ? "reset" : "sign-in"}
      next={typeof next === "string" ? next : null}
      dict={{ signIn: dict.signIn, common: dict.common }}
    />
  );
}
