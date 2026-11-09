"use client"

import { useCallback, useEffect, useState, type RefObject } from "react"

// Shared form pattern (QA Q1, Design §6 forms): after a submit with invalid fields, the first
// field marked aria-invalid="true" (in DOM order) is scrolled into view and focused. Each field
// already renders its own message and the destructive border (`aria-invalid:border-destructive`
// in components/ui), so this only moves the user to the first problem.

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'

function isFocusable(el: HTMLElement) {
  return el.matches(FOCUSABLE) && el.getAttribute("aria-hidden") !== "true"
}

/** The element to focus for an invalid field: itself, or its tab stop (a radio group's checked item). */
function focusTarget(el: HTMLElement): HTMLElement | null {
  if (isFocusable(el)) return el
  return (
    el.querySelector<HTMLElement>('[tabindex="0"]') ??
    Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).find(isFocusable) ??
    null
  )
}

/** Scrolls the first invalid field inside `root` into view and focuses it. Returns the field, or null. */
export function focusFirstInvalid(root: Element | Document | null | undefined): HTMLElement | null {
  if (!root) return null
  const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!invalid) return null
  const target = focusTarget(invalid) ?? invalid
  invalid.scrollIntoView?.({ block: "center", behavior: "smooth" })
  target.focus({ preventScroll: true })
  return target
}

/**
 * Call the returned function right after setting the field errors; once React has rendered
 * them, the first invalid field inside `ref` is scrolled into view and focused.
 */
export function useFocusFirstInvalid(ref: RefObject<HTMLElement | null>): () => void {
  const [request, setRequest] = useState(0)
  useEffect(() => {
    if (request > 0) focusFirstInvalid(ref.current)
  }, [request, ref])
  return useCallback(() => setRequest((n) => n + 1), [])
}
