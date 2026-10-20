import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "@/components/app/shells";

// Design §5.1: sidebar (computers) and bottom nav (phones, 5 items).
const SIDEBAR = ["Ljubimci", "Podsetnici", "Šapa pomoći", "Partneri", "Domaćinstvo", "Podešavanja", "Profil"];
const BOTTOM = ["Ljubimci", "Podsetnici", "Šapa pomoći", "Partneri", "Profil"];

function navs() {
  const [sidebar, bottom] = screen.getAllByRole("navigation", { name: "Glavna navigacija" });
  return { sidebar, bottom };
}

describe("AppShell (Design §5.1, §10)", () => {
  it("renders labelled navigation landmarks and the main landmark", () => {
    render(
      <AppShell active="ljubimci">
        <h1>Moji ljubimci</h1>
      </AppShell>,
    );
    expect(screen.getAllByRole("navigation", { name: "Glavna navigacija" })).toHaveLength(2);
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toHaveTextContent("Moji ljubimci");
  });

  it("the sidebar carries the Design §5.1 items in order", () => {
    render(<AppShell active="ljubimci">x</AppShell>);
    const links = within(navs().sidebar).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(SIDEBAR);
  });

  it("the phone bottom nav carries 5 items, Šapa pomoći shortened with the full aria-label", () => {
    render(<AppShell active="ljubimci">x</AppShell>);
    const links = within(navs().bottom).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("aria-label") ?? l.textContent)).toEqual(BOTTOM);
    const sapa = within(navs().bottom).getByRole("link", { name: "Šapa pomoći" });
    expect(sapa).toHaveTextContent("Šapa");
    expect(sapa).toHaveAttribute("href", "/sapa-pomoci");
  });

  it("marks the active item with aria-current", () => {
    render(<AppShell active="podsetnici">x</AppShell>);
    const active = within(navs().sidebar).getByRole("link", { current: "page" });
    expect(active).toHaveTextContent("Podsetnici");
    expect(active).toHaveAttribute("href", "/podsetnici");
  });

  it("shows the count badge for Podsetnici and none for zero", () => {
    render(
      <AppShell active="ljubimci" counts={{ podsetnici: 3, partneri: 0 }}>
        x
      </AppShell>,
    );
    expect(within(navs().sidebar).getByRole("link", { name: /Podsetnici/ })).toHaveTextContent("Podsetnici3 novih");
    expect(within(navs().sidebar).getByRole("link", { name: "Partneri" })).toHaveTextContent(/^Partneri$/);
  });

  it("links Poruke with the unread count in the phone top bar", () => {
    render(
      <AppShell active="ljubimci" counts={{ poruke: 2 }}>
        x
      </AppShell>,
    );
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "Poruke, 2 nepročitanih" })).toHaveAttribute("href", "/poruke");
  });

  it("the organisation shell for a breeder lists Legla and Upiti", () => {
    render(
      <AppShell variant="organisation" orgType="breeder" active="zivotinje">
        x
      </AppShell>,
    );
    const names = within(navs().sidebar).getAllByRole("link").map((l) => l.textContent);
    expect(names).toEqual(["Životinje", "Upiti", "Legla", "Šapa pomoći", "Tim", "Javni profil", "Profil"]);
  });
});
