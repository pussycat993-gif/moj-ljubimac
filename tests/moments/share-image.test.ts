import { createElement } from "react";
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// FR-18 / FR-36 / BR-01 — "Podeli kao sliku": app/(app)/ljubimci/[id]/trenuci/share-image.ts composes the
// image in the browser with html-to-image (mocked here; the test inspects the DOM node it is given) from
// the S08 preview card (ShareCard). The image shows the pet's name, the date and the LogoMark asset; the
// logo is left out only for a user with Entitlements.logo_removal who switched it off — a Free user's
// image always carries it. Rendered at pixelRatio 3; shared through the Web Share API with the file, or
// downloaded as moj-ljubimac-<date>.png.

const toBlob = vi.fn<(node: HTMLElement, opts?: unknown) => Promise<Blob>>(async () => new Blob(["png"], { type: "image/png" }));
vi.mock("html-to-image", () => ({ toBlob: (node: HTMLElement, opts?: unknown) => toBlob(node, opts) }));

const { shareMomentImage, showsLogo, shareFileName, photoDataUrl, SHARE_PIXEL_RATIO } = await import(
  "@/app/(app)/ljubimci/[id]/trenuci/share-image"
);
const { ShareCard } = await import("@/app/(app)/ljubimci/[id]/trenuci/moments-client");

function card({ withLogo }: { withLogo: boolean }) {
  const { getByTestId } = render(
    createElement(ShareCard, {
      petName: "Maks",
      petSex: "male",
      dateLabel: "12. 10. 2026.",
      photoSrc: "data:image/jpeg;base64,AAAA",
      withLogo,
    }),
  );
  return getByTestId("share-card");
}

function composedNode(): HTMLElement {
  expect(toBlob).toHaveBeenCalledTimes(1);
  return toBlob.mock.calls[0][0];
}

const logoOf = (node: HTMLElement) =>
  [...node.querySelectorAll("img")].find((img) => decodeURIComponent(img.getAttribute("src") ?? "").includes("/brand/logo-mark.png"));

beforeEach(() => {
  toBlob.mockClear();
  Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("share-image.ts", () => {
  it("composes the image from a node with the pet's name, the date and the Moj Ljubimac logo (FR-18)", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:share");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await shareMomentImage({ node: card({ withLogo: true }), momentDate: "2026-10-12", title: "Maks" });
    const node = composedNode();
    expect(node.textContent).toContain("Maks");
    expect(node.textContent).toContain("12. 10. 2026.");
    const logo = logoOf(node);
    expect(logo).toBeDefined();
    expect(logo!.getAttribute("alt")).toBe("Moj Ljubimac");
    expect(node.querySelector('img[alt="Maks, 12. 10. 2026."]')?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    expect(toBlob.mock.calls[0][1]).toMatchObject({ pixelRatio: SHARE_PIXEL_RATIO });
    expect(SHARE_PIXEL_RATIO).toBe(3);
  });

  it("leaves the logo out when a Premium user (logo_removal) switches it off (FR-18)", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:share");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    expect(showsLogo({ logoRemoval: true, removeLogo: true })).toBe(false);
    await shareMomentImage({ node: card({ withLogo: showsLogo({ logoRemoval: true, removeLogo: true }) }), momentDate: "2026-10-12", title: "Maks" });
    const node = composedNode();
    expect(logoOf(node)).toBeUndefined();
    expect(node.textContent).toContain("Maks");
    expect(node.textContent).toContain("12. 10. 2026.");
  });

  it("keeps the logo for a Premium user who leaves the switch on", () => {
    expect(showsLogo({ logoRemoval: true, removeLogo: false })).toBe(true);
  });

  it("always keeps the logo for a Free user, whatever the switch says (FR-18, FR-36, BR-01)", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:share");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    expect(showsLogo({ logoRemoval: false, removeLogo: true })).toBe(true);
    expect(showsLogo({ logoRemoval: false, removeLogo: false })).toBe(true);
    await shareMomentImage({ node: card({ withLogo: showsLogo({ logoRemoval: false, removeLogo: true }) }), momentDate: "2026-10-12", title: "Maks" });
    expect(logoOf(composedNode())).toBeDefined();
  });

  it("shares the PNG file through the Web Share API when the browser can share files", async () => {
    const share = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    expect(await shareMomentImage({ node: card({ withLogo: true }), momentDate: "2026-10-12", title: "Maks" })).toBe("shared");
    const [{ files, title }] = share.mock.calls[0] as unknown as [{ files: File[]; title: string }];
    expect(title).toBe("Maks");
    expect(files[0].name).toBe("moj-ljubimac-2026-10-12.png");
    expect(files[0].type).toBe("image/png");
  });

  it("downloads moj-ljubimac-<date>.png otherwise", async () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:share");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clicked: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });

    expect(await shareMomentImage({ node: card({ withLogo: true }), momentDate: "2026-10-12", title: "Maks" })).toBe("downloaded");
    expect(clicked[0].download).toBe("moj-ljubimac-2026-10-12.png");
    expect(clicked[0].href).toBe("blob:share");
    expect(revoke).toHaveBeenCalledWith("blob:share");
    expect(shareFileName("2026-10-12")).toBe("moj-ljubimac-2026-10-12.png");
  });

  it("inlines the moment photo as a data URL with a CORS fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, blob: async () => new Blob(["jpg"], { type: "image/jpeg" }) } as Response);
    const data = await photoDataUrl("https://r2.test/get/photo.jpg?sig=1");
    expect(fetchSpy).toHaveBeenCalledWith("https://r2.test/get/photo.jpg?sig=1", { mode: "cors", cache: "no-store" });
    expect(data).toMatch(/^data:image\/jpeg;base64,/);
  });
});
