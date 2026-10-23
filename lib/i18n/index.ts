import { Fragment, createElement, type ReactNode } from "react"
import { en } from "./en"
import { sr, type Dictionary } from "./sr"

// Locale resolution (FR-35, NFR-05). Safe for server and client components: the cookie is
// read and written only on the server (lib/actions/registration.ts).
//   signed-in user → profiles.locale (EP-43)
//   auth-free pages → the `ml_locale` cookie (`sr` | `en`, set by the S15 SR/EN switch and S18);
//   no cookie → sr. No Accept-Language detection, no ?lang= parameter (owner decision, Step 12).

export type { Dictionary }
export type Locale = "sr" | "en"
/** `profiles.locale` / API `locale` values (EP-41, EP-43). */
export type ProfileLocale = "sr-Latn" | "en"

export const LOCALES: readonly Locale[] = ["sr", "en"]
export const DEFAULT_LOCALE: Locale = "sr"
export const LOCALE_COOKIE = "ml_locale"
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export const dictionaries: Record<Locale, Dictionary> = { sr, en }

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale]
}

/** A cookie value → Locale; anything else is the default (sr). */
export function parseLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : value === "sr" ? "sr" : DEFAULT_LOCALE
}

export function toProfileLocale(locale: Locale): ProfileLocale {
  return locale === "en" ? "en" : "sr-Latn"
}

export function fromProfileLocale(locale: string | null | undefined): Locale {
  return locale === "en" ? "en" : "sr"
}

/** `<html lang>` value for a locale. */
export function htmlLang(locale: Locale): string {
  return locale === "en" ? "en" : "sr-Latn"
}

/** Fills `{name}` placeholders with strings. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

/** Fills `{name}` placeholders with React nodes (links, emphasised values) without extra wrappers. */
export function interpolate(template: string, values: Record<string, ReactNode>): ReactNode[] {
  return template
    .split(/(\{\w+\})/)
    .filter((part) => part !== "")
    .map((part, i) => {
      const key = /^\{(\w+)\}$/.exec(part)?.[1]
      return createElement(Fragment, { key: i }, key !== undefined && key in values ? values[key] : part)
    })
}
