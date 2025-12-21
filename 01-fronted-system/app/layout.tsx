import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { Toaster } from "sonner"
import "./globals.css"

// Font CSS variables are defined in globals.css using system font stacks
// This avoids network dependency on Google Fonts during development

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://cloudact.ai"),
  title: {
    default: "CloudAct.ai - Master Your GenAI & Cloud Costs",
    template: "%s | CloudAct.ai",
  },
  description:
    "Intelligent cost monitoring and optimization for GenAI and cloud infrastructure. Reduce costs by 67% on average.",
  generator: "v0.app",
  keywords: ["cloud cost optimization", "GenAI costs", "FinOps", "AWS", "Azure", "GCP", "OpenAI", "Anthropic", "cost management"],
  authors: [{ name: "CloudAct.ai" }],
  creator: "CloudAct.ai",
  publisher: "CloudAct.ai",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "CloudAct.ai",
    title: "CloudAct.ai - Master Your GenAI & Cloud Costs",
    description: "Intelligent cost monitoring and optimization for GenAI and cloud infrastructure. Reduce costs by 67% on average.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CloudAct.ai - GenAI & Cloud Cost Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CloudAct.ai - Master Your GenAI & Cloud Costs",
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
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body className={`font-sans antialiased`}>
        {children}
        <Toaster position="top-right" richColors closeButton duration={5000} />
        <Analytics />
      </body>
    </html>
  )
}
