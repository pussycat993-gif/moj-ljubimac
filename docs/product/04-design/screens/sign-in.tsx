"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { CircleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { AuthShell } from "../components/shells"
import { StateSwitcher } from "../components/state-switcher"

type ViewState = "default" | "error"

const states: { value: ViewState; label: string }[] = [
  { value: "default", label: "D" },
  { value: "error", label: "X" },
]

export default function SignInScreen() {
  const [state, setState] = useState<ViewState>("default")
  const [email, setEmail] = useState("ivana.petrovic@gmail.com")
  const [password, setPassword] = useState("")
  const [emailError, setEmailError] = useState<string | undefined>()

  const isError = state === "error"

  function validateEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? undefined : "Upiši ispravnu mejl adresu."
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const err = validateEmail(email)
    setEmailError(err)
    if (!err && password.length === 0) setState("error")
  }

  return (
    <AuthShell>
      <StateSwitcher
        states={states}
        value={state}
        onChange={(v) => {
          setState(v)
          setEmailError(undefined)
        }}
      />

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

        <Button type="button" variant="outline" className="h-11 w-full md:h-9">
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
              <Link href="/zaboravljena-lozinka" className="shrink-0 text-sm font-medium text-primary hover:underline">
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
          <Button type="submit" className="h-11 w-full md:h-9">
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
    </AuthShell>
  )
}
