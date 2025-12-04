import { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cloudact.ai"

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/private/", "/_next/", "/auth/"],
      },
      {
        userAgent: "GPTBot",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
      {
        userAgent: "ChatGPT-User",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
      {
        userAgent: "Claude-Web",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
      {
        userAgent: "Anthropic-AI",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
      {
        userAgent: "Google-Extended",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
      {
        userAgent: "PerplexityBot",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
      {
        userAgent: "Bytespider",
        allow: ["/", "/features", "/pricing", "/solutions", "/about", "/resources"],
        disallow: ["/api/", "/private/", "/auth/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
