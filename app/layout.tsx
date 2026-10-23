import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
import { getVisitorLocale } from "@/lib/actions/registration";
import { fromProfileLocale, htmlLang, type Locale } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import "./globals.css";

const nunito = Nunito({
  weight: ["700"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-nunito",
});

const inter = Inter({
  weight: ["400", "500", "600"],
  subsets: ["latin", "latin-ext"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Moj Ljubimac",
  icons: {
    icon: "/brand/app-icon-192.png",
    apple: "/brand/app-icon-180.png",
  },
};

// Active locale (FR-35, owner decision Step 12): a signed-in user's profiles.locale, otherwise the
// visitor's ml_locale cookie (no cookie → sr).
async function activeLocale(): Promise<Locale> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data } = await supabase.from("profiles").select("locale").eq("id", user.id).maybeSingle();
    if (data) return fromProfileLocale(data.locale);
  }
  return getVisitorLocale();
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await activeLocale();
  return (
    <html lang={htmlLang(locale)} className={`${nunito.variable} ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
