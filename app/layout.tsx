import type { Metadata } from "next";
import {
  Noto_Naskh_Arabic,
  Playfair_Display,
  Plus_Jakarta_Sans,
} from "next/font/google";
import "./globals.css";

// next/font downloads each face at build time and self-hosts it, so the page
// ships no <link> to a font CDN and no runtime font request.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
});

// Arabic has no coverage in the two Latin faces, so a real Arabic face sits in
// the stack. Without it the browser synthesises Arabic and it looks wrong.
const arabic = Noto_Naskh_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Boutique Elegance - AI Employee demo",
  description:
    "A shop assistant that takes clothing orders in a chat, in Arabic, French and English.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${playfair.variable} ${jakarta.variable} ${arabic.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
