import { readFileSync } from "node:fs"
import { join } from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

// Step FX — Step 32 defects D-03 and D-06 (NFR-04, Design §10).
// D-03: inactive tab labels were `text-foreground/60` (#7c726a on #f6f1eb = 4.18:1, #796e65 on #efe7df = 4.05:1),
// below the 4.5:1 of Design §10. They now use --muted-foreground, which passes on both backgrounds.
// D-06: tab panels take focus (Radix tabindex 0) and had `outline-none` with no ring; they now show the
// Design §10 focus ring (`focus-visible:ring-2 ring-ring ring-offset-2`).

const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
const token = (name: string) => {
  const m = new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`).exec(css)
  if (!m) throw new Error(`missing token ${name}`)
  return m[1]
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  )
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function renderTabs() {
  return render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Uskoro</TabsTrigger>
        <TabsTrigger value="b">Urađeno</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
    </Tabs>,
  )
}

describe("D-03 — inactive tab label contrast", () => {
  it("the inactive trigger uses --muted-foreground, not a 60 % foreground", () => {
    renderTabs()
    const inactive = screen.getByRole("tab", { name: "Urađeno" })
    expect(inactive).toHaveAttribute("data-state", "inactive")
    expect(inactive.className).not.toMatch(/(^|\s)text-foreground\/60(\s|$)/)
    expect(inactive.className).toMatch(/(^|\s)text-muted-foreground(\s|$)/)
  })

  it("--muted-foreground reaches 4.5:1 on the page background and on the TabsList (--muted)", () => {
    expect(contrast(token("--muted-foreground"), token("--background"))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token("--muted-foreground"), token("--muted"))).toBeGreaterThanOrEqual(4.5)
  })
})

describe("D-06 — tab panel focus ring", () => {
  it("the focusable tab panel shows the Design §10 ring on keyboard focus", () => {
    renderTabs()
    const panel = screen.getByRole("tabpanel")
    expect(panel).toHaveAttribute("tabindex", "0")
    for (const c of ["focus-visible:ring-2", "focus-visible:ring-ring", "focus-visible:ring-offset-2"]) {
      expect(panel.className.split(/\s+/)).toContain(c)
    }
  })
})
