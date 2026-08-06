import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bergenstjerne FK – Skrapelodd",
  description: "Digitale skrapelodd til inntekt for Bergenstjerne FK"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="nb"><body>{children}</body></html>;
}
