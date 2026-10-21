"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  requestPasswordReset,
  resendVerification,
  signInWithGoogle,
  signInWithPassword,
} from "@/lib/actions/auth"

// S16 — Prijava · /prijava · FR-34, EP-42. States: default, error (401 wrong credentials,
// 403 email_not_verified with resend). "Zaboravljena lozinka?" opens the reset view on the
// same page (/prijava?view=reset); a valid request always shows the sent state.

type View = "sign-in" | "reset" | "reset-sent"
type SignInError = "credentials" | "not_verified" | "unexpected"

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : "Upiši ispravnu mejl adresu."
}

export function SignInForm({ initialView, next }: { initialView: "sign-in" | "reset"; next: string | null }) {
  const router = useRouter()
  const [view, setView] = useState<View>(initialView)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string | undefined>()
  const [error, setError] = useState<SignInError | null>(null)
  const [resent, setResent] = useState(false)
  const [pending, setPending] = useState(false)

  const isError = error === "credentials"

  function openView(v: View) {
    setView(v)
    setEmailError(undefined)
    setError(null)
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const err = validateEmail(email)
    setEmailError(err)
    if (err) return
    if (password.length === 0) {
      setError("credentials")
      return
    }
    setPending(true)
    const result = await signInWithPassword({ email, password, next })
    if (result.ok) {
      router.push(result.data.redirectTo)
      return
    }
    setPending(false)
    setResent(false)
    setError(
      result.error.code === "unauthenticated"
        ? "credentials"
        : result.error.code === "email_not_verified"
          ? "not_verified"
          : "unexpected",
    )
  }

  async function onGoogle() {
    setPending(true)
    const result = await signInWithGoogle({ next })
    if (result.ok) {
      window.location.assign(result.data.url)
      return
    }
    setPending(false)
    setError("unexpected")
  }

  async function onResend() {
    setPending(true)
    const result = await resendVerification({ email })
    setPending(false)
    if (result.ok) setResent(true)
    else setError("unexpected")
  }

  async function onResetSubmit(ev: FormEvent) {
    ev.preventDefault()
    const err = validateEmail(email)
    setEmailError(err)
    if (err) return
    setPending(true)
    await requestPasswordReset({ email })
    setPending(false)
    setView("reset-sent")
  }

  if (view === "reset" || view === "reset-sent") {
    return (
      <Card className="gap-6 p-4 md:p-6">
        <div className="space-y-1">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Nova lozinka</h1>
          {view === "reset" ? (
            <p className="text-sm text-muted-foreground">
              Upiši mejl adresu naloga i poslaćemo ti link za novu lozinku.
            </p>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">
              Ako nalog sa adresom <span className="font-medium text-foreground">{email}</span> postoji, poslali smo
              link za novu lozinku. Proveri i spam folder.
            </p>
          )}
        </div>

        {view === "reset" && (
          <form className="space-y-4" noValidate onSubmit={onResetSubmit}>
            <div className="space-y-2">
              <Label htmlFor="reset-email">Mejl adresa</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                aria-invalid={!!emailError}
                aria-describedby={emailError ? "reset-email-error" : undefined}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={() => setEmailError(validateEmail(email))}
              />
              {emailError && (
                <p id="reset-email-error" className="text-sm text-destructive">
                  {emailError}
                </p>
              )}
            </div>
            <Button type="submit" className="h-11 w-full md:h-9" disabled={pending}>
              Pošalji link
            </Button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link href="/prijava" className="font-medium text-primary hover:underline" onClick={() => openView("sign-in")}>
            Nazad na prijavu
          </Link>
        </p>
      </Card>
    )
  }

  return (
    <Card className="gap-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-[28px] leading-9 font-bold">Zdravo ponovo</h1>
        <p className="text-sm text-muted-foreground">Prijavi se da vidiš kartone i podsetnike svojih ljubimaca.</p>
      </div>

      {isError && (
        <div role="alert" className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-destructive">Pogrešan mejl ili lozinka.</p>
            <p className="text-sm text-muted-foreground">
              Proveri podatke ili resetuj lozinku. Ako koristiš Google nalog, prijavi se dugmetom ispod.
            </p>
          </div>
        </div>
      )}

      {error === "not_verified" && (
        <div role="alert" className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-sm font-medium text-destructive">
              Mejl adresa još nije potvrđena. Otvori link iz mejla koji smo ti poslali.
            </p>
            {resent ? (
              <p role="status" className="text-sm text-muted-foreground">
                Poslali smo novi link za potvrdu na <span className="font-medium text-foreground">{email}</span>.
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full md:h-9"
                disabled={pending}
                onClick={onResend}
              >
                Pošalji link ponovo
              </Button>
            )}
          </div>
        </div>
      )}

      {error === "unexpected" && (
        <div role="alert" className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-destructive">Nešto nije u redu. Pokušaj ponovo.</p>
          </div>
        </div>
      )}

      <Button type="button" variant="outline" className="h-11 w-full md:h-9" disabled={pending} onClick={onGoogle}>
        Nastavi sa Google-om
      </Button>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="shrink-0 text-xs font-medium text-muted-foreground">ili mejlom</span>
        <Separator className="flex-1" />
      </div>

      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="signin-email">Mejl adresa</Label>
          <Input
            id="signin-email"
            type="email"
            autoComplete="email"
            value={email}
            aria-invalid={!!emailError || isError}
            aria-describedby={emailError ? "signin-email-error" : undefined}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailError(validateEmail(email))}
          />
          {emailError && (
            <p id="signin-email-error" className="text-sm text-destructive">
              {emailError}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="signin-password">Lozinka</Label>
            <Link
              href="/prijava?view=reset"
              className="shrink-0 text-sm font-medium text-primary hover:underline"
              onClick={() => openView("reset")}
            >
              Zaboravljena lozinka?
            </Link>
          </div>
          <Input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            value={password}
            aria-invalid={isError}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="h-11 w-full md:h-9" disabled={pending}>
          Prijavi se
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Nemaš nalog?{" "}
        <Link href="/registracija" className="font-medium text-primary hover:underline">
          Napravi nalog
        </Link>
      </p>
    </Card>
  )
}
