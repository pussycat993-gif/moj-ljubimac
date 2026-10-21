"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { CircleAlert, CircleCheck, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setNewPassword } from "@/lib/actions/auth"

// S28 — Nova lozinka · /prijava/nova-lozinka · FR-34 (reset link sets a new password once)

type ViewState = "default" | "expired" | "success"

const MIN_LENGTH = 8

type Errors = { password?: string; repeat?: string }

export function NewPasswordForm({ email }: { email: string | null }) {
  const [view, setView] = useState<ViewState>(email === null ? "expired" : "default")
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  function validate(): Errors {
    const e: Errors = {}
    if (password.length < MIN_LENGTH) e.password = `Lozinka mora imati najmanje ${MIN_LENGTH} znakova.`
    if (!repeat) e.repeat = "Ponovi novu lozinku."
    else if (repeat !== password) e.repeat = "Lozinke se ne poklapaju. Upiši istu lozinku dva puta."
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length > 0) return
    setPending(true)
    setFailed(false)
    const result = await setNewPassword({ password })
    setPending(false)
    if (result.ok) setView("success")
    else if (result.error.code === "invalid_action_token" || result.error.code === "unauthenticated") setView("expired")
    else if (result.error.code === "validation_failed")
      setErrors({ password: `Lozinka mora imati najmanje ${MIN_LENGTH} znakova.` })
    else setFailed(true)
  }

  if (view === "expired") {
    return (
      // API error `invalid_action_token`: link already used or older than its validity
      <Card role="alert" className="gap-4 p-4 md:p-6">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-1 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-[28px] leading-9 font-bold">Link je istekao</h1>
            <p className="text-sm text-muted-foreground">
              Ovaj link za novu lozinku je već iskorišćen ili je istekao. Zatraži novi — stiže za minut na tvoj mejl.
            </p>
          </div>
        </div>
        <Button asChild className="h-11 w-full md:h-9">
          <Link href="/prijava?view=reset">Pošalji novi link</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Setio/la si se lozinke?{" "}
          <Link href="/prijava" className="font-medium text-primary hover:underline">
            Prijavi se
          </Link>
        </p>
      </Card>
    )
  }

  if (view === "success") {
    return (
      <Card role="status" className="items-center gap-4 p-4 text-center md:p-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-foreground/5">
          <CircleCheck className="size-6 text-success" aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="font-heading text-[28px] leading-9 font-bold">Lozinka je promenjena</h1>
          <p className="text-sm text-muted-foreground">Od sada se prijavljuješ novom lozinkom. Stari link više ne važi.</p>
        </div>
        <Button asChild className="h-11 w-full md:h-9">
          <Link href="/prijava">Prijavi se</Link>
        </Button>
      </Card>
    )
  }

  return (
    <Card className="gap-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-[28px] leading-9 font-bold">Nova lozinka</h1>
        <p className="text-sm text-muted-foreground">
          Postavljaš lozinku za nalog <span className="font-medium text-foreground">{email}</span>.
        </p>
      </div>

      {failed && (
        <div role="alert" className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-destructive">Nešto nije u redu. Pokušaj ponovo.</p>
          </div>
        </div>
      )}

      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="new-password">Nova lozinka</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={password}
            aria-invalid={!!errors.password}
            aria-describedby={errors.password ? "new-password-error new-password-hint" : "new-password-hint"}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setErrors((er) => ({ ...er, password: password ? validate().password : er.password }))}
            className="h-11 md:h-9"
          />
          <p id="new-password-hint" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4 shrink-0" aria-hidden />
            Najmanje {MIN_LENGTH} znakova. Najbolje fraza koju samo ti znaš.
          </p>
          {errors.password && (
            <p id="new-password-error" className="text-sm text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="repeat-password">Ponovi lozinku</Label>
          <Input
            id="repeat-password"
            type="password"
            autoComplete="new-password"
            value={repeat}
            aria-invalid={!!errors.repeat}
            aria-describedby={errors.repeat ? "repeat-password-error" : undefined}
            onChange={(e) => setRepeat(e.target.value)}
            onBlur={() => setErrors((er) => ({ ...er, repeat: repeat ? validate().repeat : er.repeat }))}
            className="h-11 md:h-9"
          />
          {errors.repeat && (
            <p id="repeat-password-error" className="text-sm text-destructive">
              {errors.repeat}
            </p>
          )}
        </div>

        <Button type="submit" className="h-11 w-full md:h-9" disabled={pending}>
          Sačuvaj novu lozinku
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/prijava" className="font-medium text-primary hover:underline">
          Nazad na prijavu
        </Link>
      </p>
    </Card>
  )
}
