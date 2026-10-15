import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppProviders } from "@/components/providers/app-providers";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Halaman (Server Component) cukup `export const metadata = { title: "Daftar Website" }` → "Daftar Website | Panitera".
  title: { default: "Panitera | Publishing Desk", template: "%s | Panitera" },
  description: "Platform penerbitan artikel multi-situs WordPress bertenaga AI dengan riset otonom dan kurasi media terintegrasi.",
  icons: {
    icon: [
      { url: "/assets/panitera-favicon.png", type: "image/png" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/assets/panitera-favicon.png",
    apple: "/assets/panitera-favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${plusJakartaSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="icon" href="/assets/panitera-favicon.png" type="image/png" />
        <link rel="apple-touch-icon" href="/assets/panitera-favicon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const storedTheme = localStorage.getItem('theme');
                if (storedTheme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else if (storedTheme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  document.documentElement.classList.add('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
