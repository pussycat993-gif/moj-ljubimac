import type { Metadata } from "next";
import { Inter, Nunito } from "next/font/google";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sr-Latn" className={`${nunito.variable} ${inter.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
