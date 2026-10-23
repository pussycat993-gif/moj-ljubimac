"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { CircleAlert, CircleCheck, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { setNewPassword } from "@/lib/actions/auth"
import { format, interpolate, type Dictionary } from "@/lib/i18n"
import { sr } from "@/lib/i18n/sr"

// S28 — Nova lozinka · /prijava/nova-lozinka · FR-34 (reset link sets a new password once)

type ViewState = "default" | "expired" | "success"

const MIN_LENGTH = 8

type Errors = { password?: string; repeat?: string }

type NewPasswordCopy = Pick<Dictionary, "newPassword" | "common">

export function NewPasswordForm({
  email,
  dict = { newPassword: sr.newPassword, common: sr.common },
}: {
  email: string | null
  /** Copy of the active locale (lib/i18n); defaults to Serbian. */
  dict?: NewPasswordCopy
}) {
  const t = dict.newPassword
  const tooShort = format(t.tooShort, { min: MIN_LENGTH })
  const [view, setView] = useState<ViewState>(email === null ? "expired" : "default")
  const [password, setPassword] = useState("")
  const [repeat, setRepeat] = useState("")
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)

  function validate(): Errors {
    const e: Errors = {}
    if (password.length < MIN_LENGTH) e.password = tooShort
    if (!repeat) e.repeat = t.repeatMissing
    else if (repeat !== password) e.repeat = t.mismatch
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
      setErrors({ password: tooShort })
    else setFailed(true)
  }

  if (view === "expired") {
    return (
      // API error `invalid_action_token`: link already used or older than its validity
      <Card role="alert" className="gap-4 p-4 md:p-6">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-1 size-5 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <h1 className="font-heading text-[28px] leading-9 font-bold">{t.expiredTitle}</h1>
            <p className="text-sm text-muted-foreground">
              {t.expiredText}
            </p>
          </div>
        </div>
        <Button asChild className="h-11 w-full md:h-9">
          <Link href="/prijava?view=reset">{t.sendNewLink}</Link>
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          {t.remembered}{" "}
          <Link href="/prijava" className="font-medium text-primary hover:underline">
            {t.signIn}
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
          <h1 className="font-heading text-[28px] leading-9 font-bold">{t.successTitle}</h1>
          <p className="text-sm text-muted-foreground">{t.successText}</p>
        </div>
        <Button asChild className="h-11 w-full md:h-9">
          <Link href="/prijava">{t.signIn}</Link>
        </Button>
      </Card>
    )
  }

  return (
    <Card className="gap-6 p-4 md:p-6">
      <div className="space-y-1">
        <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">
          {interpolate(t.forAccount, { email: <span className="font-medium text-foreground">{email}</span> })}
        </p>
      </div>

      {failed && (
        <div role="alert" className="flex items-start gap-3 rounded-sm bg-foreground/5 p-3">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-destructive">{dict.common.error}</p>
          </div>
        </div>
      )}

      <form className="space-y-4" noValidate onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="new-password">{t.label}</Label>
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
            {format(t.hint, { min: MIN_LENGTH })}
          </p>
          {errors.password && (
            <p id="new-password-error" className="text-sm text-destructive">
              {errors.password}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="repeat-password">{t.repeat}</Label>
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
          {t.submit}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/prijava" className="font-medium text-primary hover:underline">
          {t.backToSignIn}
        </Link>
      </p>
    </Card>
  )
}
