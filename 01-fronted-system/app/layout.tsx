import type React from "react"
import type { Metadata } from "next"
import { DM_Sans, JetBrains_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"

import { site } from "@/lib/site"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

// Load DM Sans for the entire app - premium, modern sans-serif
const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-dm-sans",
  display: "swap",
})

// JetBrains Mono for code blocks and technical content
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} - Master Your GenAI & Cloud Costs`,
    template: `%s | ${site.name}`,
  },
  description:
    "Intelligent cost monitoring and optimization for GenAI and cloud infrastructure. Reduce costs by 67% on average.",
  generator: site.name,
  keywords: ["cloud cost optimization", "GenAI costs", "FinOps", "AWS", "Azure", "GCP", "OpenAI", "Anthropic", "cost management"],
  authors: [{ name: site.name }],
  creator: site.name,
  publisher: site.name,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: site.name,
    title: `${site.name} - Master Your GenAI & Cloud Costs`,
    description: "Intelligent cost monitoring and optimization for GenAI and cloud infrastructure. Reduce costs by 67% on average.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: `${site.name} - GenAI & Cloud Cost Intelligence`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name} - Master Your GenAI & Cloud Costs`,
    description: "Intelligent cost monitoring and optimization for GenAI and cloud infrastructure.",
    images: ["/og-image.png"],
    creator: "@cloudact_ai",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      {
        url: "/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: "/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth" className={`${dmSans.variable} ${jetbrainsMono.variable}`}>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors closeButton duration={5000} />
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
