import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "India Research Watch",
  description: "A visual explorer for India's research and development ecosystem."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
