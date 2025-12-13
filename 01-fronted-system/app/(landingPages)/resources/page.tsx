import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, BookOpen, FileText, Video, Zap, Users } from "lucide-react"

export const metadata: Metadata = {
  title: "Resources - Documentation, Tutorials & Case Studies | CloudAct.ai",
  description: "Comprehensive guides, API references, video tutorials, and case studies to help you master cloud cost optimization with CloudAct.ai.",
  openGraph: {
    title: "Resources - Documentation, Tutorials & Case Studies | CloudAct.ai",
    description: "Everything you need to master cloud cost optimization with CloudAct.ai.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Resources - Documentation, Tutorials & Case Studies | CloudAct.ai",
    description: "Comprehensive guides and tutorials for cloud cost optimization.",
  },
}

export default function ResourcesPage() {
  const resources = [
    {
      href: "/docs",
      icon: BookOpen,
      title: "Documentation",
      description: "Comprehensive guides, API references, and integration tutorials to get you started quickly.",
      cta: "Read Docs",
      isCoral: false,
    },
    {
      href: "/blog",
      icon: FileText,
      title: "Blog & Insights",
      description: "Latest insights on cost optimization, GenAI trends, and cloud infrastructure best practices.",
      cta: "Read Blog",
      isCoral: true,
    },
    {
      href: "/tutorials",
      icon: Video,
      title: "Video Tutorials",
      description: "Step-by-step video guides covering every feature and optimization technique.",
      cta: "Watch Videos",
      isCoral: false,
    },
    {
      href: "/api",
      icon: Zap,
      title: "API Reference",
      description: "Complete API documentation with examples, SDKs, and integration guides.",
      cta: "View API Docs",
      isCoral: true,
    },
    {
      href: "/case-studies",
      icon: Users,
      title: "Case Studies",
      description: "Real-world success stories from companies optimizing millions in cloud costs.",
      cta: "Read Stories",
      isCoral: false,
    },
    {
      href: "/webinars",
      icon: Video,
      title: "Webinars",
      description: "Live and recorded sessions with cloud cost optimization experts.",
      cta: "View Webinars",
      isCoral: true,
    },
  ]

  return (
    <>
      {/* Hero Section */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-white">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="cloudact-badge-coral">
              <span className="flex h-2 w-2 rounded-full bg-cloudact-coral animate-pulse" />
              Knowledge Hub
            </div>
            <h1 className="cloudact-heading-xl">
              Resources & Learning
            </h1>
            <p className="cloudact-body text-lg max-w-2xl mx-auto">
              Everything you need to master cloud cost optimization
            </p>
          </div>
        </div>
      </section>

      {/* Resources Grid */}
      <section className="pb-16 sm:pb-20 md:pb-24 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
              {resources.map((resource) => {
                const Icon = resource.icon
                return (
                  <Link
                    key={resource.href}
                    href={resource.href}
                    className="cloudact-card group p-6 sm:p-8"
                  >
                    <div className={`mb-5 sm:mb-6 ${resource.isCoral ? "cloudact-icon-box-coral" : "cloudact-icon-box"}`}>
                      <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
                    </div>
                    <h3 className="cloudact-heading-md mb-2 sm:mb-3 group-hover:text-cloudact-teal transition-colors">{resource.title}</h3>
                    <p className="cloudact-body-sm mb-5 sm:mb-6 leading-relaxed">
                      {resource.description}
                    </p>
                    <div className="cloudact-link inline-flex items-center text-sm">
                      {resource.cta}
                      <ArrowRight className="ml-2 h-3.5 w-3.5 sm:h-4 sm:w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
