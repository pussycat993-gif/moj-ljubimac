"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Bell, ChevronRight, Database, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ErrorState } from "@/components/app/error-state"
import { signOut } from "@/lib/actions/auth"
import { updateMe, type City, type Me } from "@/lib/actions/registration"
import { fromProfileLocale, toProfileLocale, type Dictionary, type Locale } from "@/lib/i18n"

type ProfileCopy = Pick<Dictionary, "profile" | "common">
type Errors = { city?: string; form?: string }

// S18 — Profil · /profil · FR-35 · EP-43 (get, update), EP-67 (cities), EP-42 (sign out).
// Name, city and language only; the subscription card is Step 23.
export function ProfileClient({
  me,
  cities,
  copy,
}: {
  me: Me | null
  cities: City[]
  copy: Record<Locale, ProfileCopy>
}) {
  const router = useRouter()
  const [locale, setLocale] = useState<Locale>(fromProfileLocale(me?.locale))
  const [name, setName] = useState(me?.full_name ?? "")
  const [city, setCity] = useState(me?.city?.id ?? "")
  const [language, setLanguage] = useState<Locale>(fromProfileLocale(me?.locale))
  const [errors, setErrors] = useState<Errors>({})
  const [pending, setPending] = useState(false)
  const t = copy[locale].profile
  const common = copy[locale].common

  async function onSave() {
    setPending(true)
    setErrors({})
    const result = await updateMe({ full_name: name, city_id: city || null, locale: toProfileLocale(language) })
    setPending(false)
    if (result.ok) {
      // A language change switches the UI at once; the refresh re-renders the shell in it.
      setLocale(fromProfileLocale(result.data.locale))
      router.refresh()
      return
    }
    const fields = result.error.fields
    if (result.error.code === "validation_failed" && fields?.city_id) setErrors({ city: t.errCity })
    else setErrors({ form: common.error })
  }

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-[28px] leading-9 font-bold">{t.title}</h1>

      {me === null ? (
        <ErrorState message={common.error} onRetry={() => router.refresh()} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            {/* Personal details */}
            <Card className="gap-4 p-4 md:p-6">
              <h2 className="font-heading text-lg font-bold">{t.personal}</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-name">{t.name}</Label>
                  <Input id="profile-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-city">{t.city}</Label>
                  <Select
                    value={city}
                    onValueChange={(v) => {
                      setCity(v)
                      setErrors((p) => ({ ...p, city: undefined }))
                    }}
                  >
                    <SelectTrigger
                      id="profile-city"
                      className="w-full"
                      aria-invalid={!!errors.city}
                      aria-describedby={errors.city ? "profile-city-error" : undefined}
                    >
                      <SelectValue placeholder={t.cityPlaceholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {locale === "en" ? c.name_en : c.name_sr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.city && (
                    <p id="profile-city-error" className="text-sm text-destructive">
                      {errors.city}
                    </p>
                  )}
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-email">{t.email}</Label>
                  <Input id="profile-email" type="email" value={me.email} readOnly />
                </div>
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="profile-language">{t.language}</Label>
                  <Select value={language} onValueChange={(v) => setLanguage(v as Locale)}>
                    <SelectTrigger id="profile-language" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sr">{t.languageSr}</SelectItem>
                      <SelectItem value="en">{t.languageEn}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {errors.form && (
                <p role="alert" className="text-sm text-destructive">
                  {errors.form}
                </p>
              )}
              <Button className="h-11 md:h-9 md:self-start" disabled={pending} onClick={onSave}>
                {t.save}
              </Button>
            </Card>
          </div>

          {/* Aside — links */}
          <aside className="min-w-0 space-y-4">
            <Card className="gap-0 py-0">
              <Link
                href="/podesavanja/podsetnici"
                className="flex items-center gap-3 p-4 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Bell className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.reminderSettings}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.reminderSettingsHint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
              <Separator />
              <Link
                href="/profil/podaci"
                className="flex items-center gap-3 p-4 hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Database className="size-5 shrink-0 text-primary" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{t.myData}</span>
                  <span className="block truncate text-xs text-muted-foreground">{t.myDataHint}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </Card>
            <Button variant="outline" className="h-11 w-full md:h-9" onClick={() => void signOut()}>
              <LogOut className="size-5" aria-hidden />
              {t.signOut}
            </Button>
          </aside>
        </div>
      )}
    </div>
  )
}
