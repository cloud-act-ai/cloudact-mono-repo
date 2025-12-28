import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  FileText,
  Video,
  Users,
  FileCode,
  Newspaper,
  GraduationCap,
  PlayCircle,
  Briefcase,
  Search,
  Filter,
  Mail,
  TrendingUp,
  Zap,
  Code,
  Cloud,
  DollarSign,
  BarChart3,
  CheckCircle2,
  Download,
  ExternalLink,
  Clock
} from "lucide-react"

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
  const categories = [
    {
      id: "blog",
      icon: Newspaper,
      title: "Blog",
      description: "Latest insights on cost optimization",
      count: "Articles",
      color: "teal",
    },
    {
      id: "guides",
      icon: BookOpen,
      title: "Guides",
      description: "Step-by-step tutorials",
      count: "Tutorials",
      color: "coral",
    },
    {
      id: "webinars",
      icon: PlayCircle,
      title: "Webinars",
      description: "Live and recorded sessions",
      count: "Sessions",
      color: "teal",
    },
    {
      id: "case-studies",
      icon: Briefcase,
      title: "Case Studies",
      description: "Real-world success stories",
      count: "Stories",
      color: "coral",
    },
    {
      id: "documentation",
      icon: FileCode,
      title: "Documentation",
      description: "Complete API reference",
      count: "Reference",
      color: "teal",
    },
    {
      id: "videos",
      icon: Video,
      title: "Videos",
      description: "Quick video tutorials",
      count: "Tutorials",
      color: "coral",
    },
  ]

  const featuredResources = [
    {
      category: "Guide",
      title: "Complete Guide to Cloud Cost Optimization",
      description: "Learn proven strategies to optimize your cloud spending while maintaining performance and reliability.",
      readTime: "15 min read",
      date: "Dec 18, 2025",
      tags: ["Cost Optimization", "Best Practices", "Strategy"],
      href: "/guides/cloud-cost-optimization",
      featured: true,
    },
    {
      category: "Case Study",
      title: "Enterprise Cloud Cost Optimization",
      description: "Discover how enterprise teams use CloudAct.ai's advanced analytics to gain visibility and reduce cloud costs.",
      readTime: "8 min read",
      date: "Dec 15, 2025",
      tags: ["Success Story", "Enterprise", "ROI"],
      href: "/case-studies/enterprise",
    },
    {
      category: "Blog",
      title: "GenAI Cost Management Best Practices",
      description: "Essential strategies for controlling and optimizing costs in your GenAI and LLM applications.",
      readTime: "10 min read",
      date: "Dec 12, 2025",
      tags: ["GenAI", "LLM", "Cost Control"],
      href: "/blog/genai-cost-management",
    },
    {
      category: "Video Tutorial",
      title: "Getting Started with CloudAct.ai",
      description: "A comprehensive walkthrough of setting up your first organization and running cost analysis pipelines.",
      readTime: "12 min watch",
      date: "Dec 10, 2025",
      tags: ["Tutorial", "Setup", "Beginner"],
      href: "/tutorials/getting-started",
    },
    {
      category: "Documentation",
      title: "API Reference & Integration Guide",
      description: "Complete documentation for integrating CloudAct.ai with your cloud providers and existing workflows.",
      readTime: "Reference",
      date: "Updated Dec 20",
      tags: ["API", "Integration", "Developer"],
      href: "/docs/api-reference",
    },
    {
      category: "Webinar",
      title: "Cloud Cost Optimization in 2025",
      description: "Join our experts for a live session on the latest trends and techniques in cloud cost management.",
      readTime: "45 min session",
      date: "Jan 5, 2026",
      tags: ["Webinar", "Live", "Expert Panel"],
      href: "/webinars/2025-optimization",
    },
  ]

  const popularTopics = [
    { name: "Cost Optimization", icon: TrendingUp },
    { name: "GenAI & LLMs", icon: Zap },
    { name: "API Integration", icon: Code },
    { name: "Multi-Cloud", icon: Cloud },
    { name: "ROI Analysis", icon: DollarSign },
    { name: "Analytics", icon: BarChart3 },
  ]

  const recentDownloads = [
    {
      title: "Cloud Cost Optimization Checklist",
      type: "PDF",
      size: "2.4 MB",
      label: "Popular",
      href: "/downloads/cost-optimization-checklist.pdf",
    },
    {
      title: "GenAI Cost Calculator Template",
      type: "Excel",
      size: "156 KB",
      label: "New",
      href: "/downloads/genai-cost-calculator.xlsx",
    },
    {
      title: "Multi-Cloud Strategy Guide",
      type: "PDF",
      size: "3.1 MB",
      label: "Featured",
      href: "/downloads/multi-cloud-strategy.pdf",
    },
  ]

  return (
    <div className="ca-landing">
      {/* Hero Section */}
      <section className="relative py-20 md:py-28 overflow-hidden bg-white">
        <div className="ca-hero-bg">
          <div className="ca-hero-grid" />
          <div className="ca-hero-orb ca-hero-orb-1" />
          <div className="ca-hero-orb ca-hero-orb-2" />
        </div>

        <div className="container mx-auto px-4 md:px-12 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-6 bg-white border border-gray-200 rounded-full shadow-md">
              <span className="flex h-2 w-2 rounded-full bg-mint animate-pulse" />
              <span className="ca-label text-mint-text">Knowledge Hub</span>
            </div>

            <h1 className="ca-display-xl mb-6">
              Resources &amp;{" "}
              <span className="ca-gradient-text">Learning Center</span>
            </h1>

            <p className="ca-body text-xl max-w-2xl mx-auto mb-10">
              Everything you need to master cloud cost optimization - from guides and tutorials to case studies and API documentation
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search resources, guides, tutorials..."
                  className="w-full pl-12 pr-4 py-4 bg-white border-2 border-gray-200 rounded-xl text-base focus:border-mint focus:outline-none focus:ring-4 focus:ring-mint/10 transition-all"
                />
                <button className="absolute right-2 top-1/2 -translate-y-1/2 ca-btn ca-btn-primary ca-btn-sm">
                  Search
                </button>
              </div>
            </div>

            {/* Popular Topics */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <span className="ca-body-sm text-gray-500">Popular:</span>
              {popularTopics.map((topic) => {
                const Icon = topic.icon
                return (
                  <button
                    key={topic.name}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:border-mint hover:bg-[var(--cloudact-bg-mint)] transition-all text-sm font-medium text-gray-700"
                  >
                    <Icon className="h-4 w-4" />
                    {topic.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Resource Categories */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4 md:px-12">
          <div className="text-center mb-12">
            <span className="ca-label text-mint-text">Browse by Category</span>
            <h2 className="ca-display-md mt-3 mb-4">Explore Our Resources</h2>
            <p className="ca-body max-w-2xl mx-auto">
              Choose from our comprehensive collection of learning materials and resources
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {categories.map((category) => {
              const Icon = category.icon
              const iconColorClass = category.color === "teal" ? "ca-feature-icon-teal" : "ca-feature-icon-coral"

              return (
                <Link
                  key={category.id}
                  href={`/resources/${category.id}`}
                  className="ca-card group"
                >
                  <div className={`ca-feature-icon ${iconColorClass} mb-5`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <h3 className="ca-heading mb-2 group-hover:text-mint-text transition-colors">
                    {category.title}
                  </h3>
                  <p className="ca-body-sm mb-4 leading-relaxed">
                    {category.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="ca-label text-gray-400">{category.count}</span>
                    <ArrowRight className="h-5 w-5 text-mint transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* Featured Resources Grid */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4 md:px-12">
          <div className="flex items-center justify-between mb-12">
            <div>
              <span className="ca-label text-coral">Featured Content</span>
              <h2 className="ca-display-md mt-3">Latest Resources</h2>
            </div>
            <button className="hidden md:inline-flex items-center gap-2 ca-btn ca-btn-secondary">
              <Filter className="h-4 w-4" />
              Filter
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {featuredResources.map((resource, index) => {
              const isFeatured = resource.featured
              const cardClass = isFeatured
                ? "ca-card border-2 border-mint shadow-xl"
                : "ca-card"

              return (
                <Link
                  key={index}
                  href={resource.href}
                  className={`${cardClass} group relative`}
                >
                  {isFeatured && (
                    <div className="absolute -top-3 left-6 px-3 py-1 bg-gradient-to-r from-mint to-mint-dark text-black text-xs font-bold rounded-full uppercase tracking-wide">
                      Featured
                    </div>
                  )}

                  <div className="mb-4">
                    <span className="inline-block px-3 py-1 bg-[var(--cloudact-bg-mint)] text-mint-text text-xs font-semibold rounded-lg">
                      {resource.category}
                    </span>
                  </div>

                  <h3 className="ca-heading text-xl mb-3 group-hover:text-mint-text transition-colors">
                    {resource.title}
                  </h3>

                  <p className="ca-body-sm mb-5 leading-relaxed">
                    {resource.description}
                  </p>

                  <div className="flex flex-wrap gap-2 mb-5">
                    {resource.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {resource.readTime}
                      </span>
                      <span>{resource.date}</span>
                    </div>
                    <ArrowRight className="h-5 w-5 text-mint transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="text-center mt-12">
            <Link href="/resources/all" className="ca-btn ca-btn-primary ca-btn-lg">
              View All Resources
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Popular Downloads */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-[var(--cloudact-bg-mint)] to-white">
        <div className="container mx-auto px-4 md:px-12">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-12">
              <span className="ca-label text-mint-text">Free Downloads</span>
              <h2 className="ca-display-md mt-3 mb-4">Popular Resources</h2>
              <p className="ca-body max-w-2xl mx-auto">
                Download our most popular guides, templates, and tools
              </p>
            </div>

            <div className="grid gap-6">
              {recentDownloads.map((download, index) => (
                <Link
                  key={index}
                  href={download.href}
                  className="ca-card group flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="ca-feature-icon ca-feature-icon-coral">
                      <Download className="h-6 w-6" />
                    </div>
                    <div>
                      <h3 className="ca-subheading mb-1 group-hover:text-mint-text transition-colors">
                        {download.title}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span className="font-mono">{download.type}</span>
                        <span>{download.size}</span>
                        <span className="px-2 py-0.5 bg-mint/10 text-mint-text text-xs rounded">
                          {download.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ExternalLink className="h-5 w-5 text-mint transition-transform group-hover:translate-x-1" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Links */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4 md:px-12">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--cloudact-bg-mint)] rounded-2xl mb-6">
                  <GraduationCap className="h-8 w-8 text-mint-text" />
                </div>
                <h3 className="ca-heading mb-3">Learning Paths</h3>
                <p className="ca-body-sm mb-5">
                  Structured courses from beginner to advanced cloud cost optimization
                </p>
                <Link href="/learning-paths" className="ca-btn ca-btn-secondary ca-btn-sm">
                  Start Learning
                </Link>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--cloudact-bg-coral)] rounded-2xl mb-6">
                  <Users className="h-8 w-8 text-coral" />
                </div>
                <h3 className="ca-heading mb-3">Community Forum</h3>
                <p className="ca-body-sm mb-5">
                  Connect with experts and peers to share insights and best practices
                </p>
                <Link href="/community" className="ca-btn ca-btn-secondary ca-btn-sm">
                  Join Community
                </Link>
              </div>

              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-[var(--cloudact-bg-mint)] rounded-2xl mb-6">
                  <Code className="h-8 w-8 text-mint-text" />
                </div>
                <h3 className="ca-heading mb-3">Developer Docs</h3>
                <p className="ca-body-sm mb-5">
                  Complete API reference, SDKs, and integration guides for developers
                </p>
                <Link href="/docs" className="ca-btn ca-btn-secondary ca-btn-sm">
                  View Docs
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Signup */}
      <section className="py-16 md:py-20 bg-gradient-to-br from-mint to-mint-dark">
        <div className="container mx-auto px-4 md:px-12">
          <div className="max-w-4xl mx-auto">
            <div className="ca-card-glass text-center p-12 md:p-16">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-black/10 backdrop-blur-sm rounded-2xl mb-6">
                <Mail className="h-10 w-10 text-black" />
              </div>

              <h2 className="ca-display-md text-black mb-4">
                Stay Updated
              </h2>
              <p className="ca-body text-black/80 text-lg mb-8 max-w-2xl mx-auto">
                Get the latest guides, case studies, and cloud cost optimization insights delivered to your inbox every week
              </p>

              <form className="max-w-md mx-auto">
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="flex-1 px-5 py-4 bg-white/95 backdrop-blur-sm border-0 rounded-xl text-base focus:outline-none focus:ring-4 focus:ring-black/10 transition-all"
                  />
                  <button
                    type="submit"
                    className="ca-btn ca-btn-coral ca-btn-lg whitespace-nowrap"
                  >
                    Subscribe
                    <CheckCircle2 className="h-5 w-5" />
                  </button>
                </div>
                <p className="text-black/70 text-sm mt-4">
                  Weekly insights for cloud professionals. Unsubscribe anytime.
                </p>
              </form>

              {/* Content Categories */}
              <div className="mt-10 pt-8 border-t border-black/10">
                <div className="flex flex-wrap items-center justify-center gap-8 text-black/80">
                  <div className="text-center">
                    <div className="ca-mono text-3xl font-bold text-black mb-1">📊</div>
                    <div className="text-sm">Guides</div>
                  </div>
                  <div className="text-center">
                    <div className="ca-mono text-3xl font-bold text-black mb-1">🎥</div>
                    <div className="text-sm">Tutorials</div>
                  </div>
                  <div className="text-center">
                    <div className="ca-mono text-3xl font-bold text-black mb-1">💡</div>
                    <div className="text-sm">Best Practices</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
