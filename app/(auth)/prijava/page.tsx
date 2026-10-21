import { SignInForm } from "./sign-in-form";

// S16 Prijava · /prijava (and /prijava?view=reset for "Zaboravljena lozinka") · FR-34, EP-42
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; next?: string | string[] }>;
}) {
  const { view, next } = await searchParams;
  return (
    <SignInForm
      initialView={view === "reset" ? "reset" : "sign-in"}
      next={typeof next === "string" ? next : null}
    />
  );
}
