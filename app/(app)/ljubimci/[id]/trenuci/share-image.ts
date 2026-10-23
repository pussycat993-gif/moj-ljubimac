import { toBlob } from "html-to-image"

// FR-18 "Podeli kao sliku" — the image is composed in the browser (TC ADR-17, API §13 row FR-18) from
// the S08 preview card with html-to-image: the photo at position 1, the pet's name, the date and the
// LogoMark. The logo stays on unless the user has Entitlements.logo_removal and switched it off (Free:
// always on — FR-18, FR-36, BR-01). The photo is inlined as a data URL first (CORS fetch of its
// presigned URL), so the canvas is never tainted. The PNG is rendered at pixelRatio 3 and handed to
// the Web Share API with the file, or downloaded as moj-ljubimac-<date>.png when files cannot be shared
// (owner decision, Step 21).

export const SHARE_PIXEL_RATIO = 3

/** Whether the shared image carries the "Moj Ljubimac" logo. */
export function showsLogo({ logoRemoval, removeLogo }: { logoRemoval: boolean; removeLogo: boolean }): boolean {
  return !(logoRemoval && removeLogo)
}

/** moj-ljubimac-<moment_date>.png */
export function shareFileName(momentDate: string): string {
  return `moj-ljubimac-${momentDate}.png`
}

/** A photo URL as a data URL (CORS fetch), so html-to-image can embed it. */
export async function photoDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { mode: "cors", cache: "no-store" })
  if (!response.ok) throw new Error(`photo fetch failed with ${response.status}`)
  const blob = await response.blob()
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("photo could not be read"))
    reader.readAsDataURL(blob)
  })
}

/** The PNG of the preview card. */
export async function composeShareImage(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: SHARE_PIXEL_RATIO })
  if (!blob) throw new Error("the share image could not be composed")
  return blob
}

/** Composes the image and shares it (Web Share API with files) or downloads it. */
export async function shareMomentImage({
  node,
  momentDate,
  title,
}: {
  node: HTMLElement
  momentDate: string
  title: string
}): Promise<"shared" | "downloaded"> {
  const blob = await composeShareImage(node)
  const file = new File([blob], shareFileName(momentDate), { type: "image/png" })
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title })
    return "shared"
  }
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = href
  link.download = file.name
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
  return "downloaded"
}
