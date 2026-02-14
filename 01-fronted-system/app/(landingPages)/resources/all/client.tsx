"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { site } from "@/lib/site"
import {
  ArrowRight,
  Clock,
  Sparkles,
  ArrowLeft,
  Search,
  Newspaper,
  BookOpen,
  PlayCircle,
  Video,
  Briefcase,
  FileCode,
  Filter,
} from "lucide-react"

// All resources combined
const ALL_RESOURCES = [
  // Blog posts
  {
    id: "blog-genai-cost",
    type: "Blog",
    typeIcon: Newspaper,
    category: "GenAI",
    title: "GenAI Cost Management Best Practices",
    description: "Essential strategies for controlling and optimizing costs in your GenAI and LLM applications.",
    readTime: "10 min read",
    date: "Dec 12, 2024",
    tags: ["GenAI", "LLM", "Cost Control"],
    href: "/resources/blog/genai-cost-management",
  },
  {
    id: "blog-multi-cloud",
    type: "Blog",
    typeIcon: Newspaper,
    category: "Strategy",
    title: "Building a Multi-Cloud Cost Strategy",
    description: "How to manage and optimize costs across AWS, GCP, and Azure without losing visibility.",
    readTime: "8 min read",
    date: "Dec 8, 2024",
    tags: ["Multi-Cloud", "Strategy"],
    href: "/resources/blog/multi-cloud-strategy",
  },
  // Guides
  {
    id: "guide-cloud-cost",
    type: "Guide",
    typeIcon: BookOpen,
    category: "Getting Started",
    title: "Complete Guide to Cloud Cost Optimization",
    description: "Learn proven strategies to optimize your cloud spending while maintaining performance.",
    readTime: "15 min read",
    date: "Dec 18, 2024",
    tags: ["Cost Optimization", "Best Practices"],
    href: "/resources/guides/complete-cloud-cost",
    featured: true,
  },
  {
    id: "guide-genai-tracking",
    type: "Guide",
    typeIcon: BookOpen,
    category: "GenAI",
    title: "Tracking GenAI & LLM Costs",
    description: "Step-by-step guide to monitoring and attributing costs across AI providers.",
    readTime: "12 min read",
    date: "Dec 14, 2024",
    tags: ["GenAI", "LLM", "Attribution"],
    href: "/resources/guides/genai-cost-tracking",
  },
  // Webinars
  {
    id: "webinar-2025-trends",
    type: "Webinar",
    typeIcon: PlayCircle,
    category: "Expert Panel",
    title: "Cloud Cost Optimization Trends for 2025",
    description: "Join our experts for a session on the latest trends in cloud cost management.",
    readTime: "45 min session",
    date: "Jan 15, 2025",
    tags: ["Trends", "Expert Panel"],
    href: "/resources/webinars/2025-trends",
  },
  {
    id: "webinar-genai-control",
    type: "Webinar",
    typeIcon: PlayCircle,
    category: "Technical",
    title: "Controlling GenAI Costs at Scale",
    description: "Practical strategies for managing LLM costs across multiple providers.",
    readTime: "60 min session",
    date: "Dec 18, 2024",
    tags: ["GenAI", "Scale"],
    href: "/resources/webinars/genai-cost-control",
  },
  // Videos
  {
    id: "video-getting-started",
    type: "Video",
    typeIcon: Video,
    category: "Tutorial",
    title: `Getting Started with ${site.name}`,
    description: "A comprehensive walkthrough of setting up your first organization.",
    readTime: "12 min watch",
    date: "Dec 10, 2024",
    tags: ["Tutorial", "Setup"],
    href: "/resources/videos/getting-started",
  },
  {
    id: "video-dashboard",
    type: "Video",
    typeIcon: Video,
    category: "Product Tour",
    title: "Dashboard Overview & Navigation",
    description: "Learn how to navigate the CloudAct dashboard and find insights quickly.",
    readTime: "8 min watch",
    date: "Dec 5, 2024",
    tags: ["Dashboard", "Navigation"],
    href: "/resources/videos/dashboard-overview",
  },
  // Case Studies
  {
    id: "case-study-fintech",
    type: "Case Study",
    typeIcon: Briefcase,
    category: "Enterprise",
    title: "Fintech Unicorn Reduces Cloud Spend by 42%",
    description: "How a fast-growing fintech gained visibility into their multi-cloud infrastructure.",
    readTime: "8 min read",
    date: "Dec 15, 2024",
    tags: ["Fintech", "42% Savings"],
    href: "/resources/case-studies/enterprise-fintech",
  },
  {
    id: "case-study-saas",
    type: "Case Study",
    typeIcon: Briefcase,
    category: "Growth Stage",
    title: "SaaS Startup Optimizes GenAI Costs",
    description: "A Series B startup discovers 60% of their AI spend was going to unused experiments.",
    readTime: "6 min read",
    date: "Dec 8, 2024",
    tags: ["SaaS", "GenAI"],
    href: "/resources/case-studies/saas-startup",
  },
  // Documentation
  {
    id: "docs-api-reference",
    type: "Documentation",
    typeIcon: FileCode,
    category: "API",
    title: "API Reference & Integration Guide",
    description: "Complete documentation for integrating CloudAct.ai with your infrastructure.",
    readTime: "Reference",
    date: "Updated Dec 20",
    tags: ["API", "Integration"],
    href: "/docs/api/reference",
  },
  {
    id: "docs-webhooks",
    type: "Documentation",
    typeIcon: FileCode,
    category: "API",
    title: "Webhooks & Events",
    description: "Set up real-time notifications for cost anomalies and budget alerts.",
    readTime: "Reference",
    date: "Updated Dec 18",
    tags: ["Webhooks", "Events"],
    href: "/docs/api/webhooks",
  },
]

// Resource types for filtering
const RESOURCE_TYPES = [
  { name: "All", count: ALL_RESOURCES.length },
  { name: "Blog", count: ALL_RESOURCES.filter(r => r.type === "Blog").length },
  { name: "Guide", count: ALL_RESOURCES.filter(r => r.type === "Guide").length },
  { name: "Webinar", count: ALL_RESOURCES.filter(r => r.type === "Webinar").length },
  { name: "Video", count: ALL_RESOURCES.filter(r => r.type === "Video").length },
  { name: "Case Study", count: ALL_RESOURCES.filter(r => r.type === "Case Study").length },
  { name: "Documentation", count: ALL_RESOURCES.filter(r => r.type === "Documentation").length },
]

export function AllResourcesPageClient() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedType, setSelectedType] = useState<string>("All")

  const filteredResources = useMemo(() => {
    return ALL_RESOURCES.filter((resource) => {
      const matchesSearch = searchQuery === "" ||
        resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesType = selectedType === "All" || resource.type === selectedType

      return matchesSearch && matchesType
    })
  }, [searchQuery, selectedType])

  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <Link href="/resources" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Resources
          </Link>
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            All Resources
          </div>
          <h1 className="ca-page-hero-title">
            Browse{" "}
            <span className="font-semibold">Everything</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            {ALL_RESOURCES.length} resources to help you master cloud cost optimization.
          </p>

          {/* Search Bar */}
          <div className="ca-resources-search">
            <div className="ca-resources-search-inner">
              <Search className="w-5 h-5" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search all resources..."
                className="ca-resources-search-input"
                aria-label="Search resources"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="button" className="ca-btn-hero-primary ca-resources-search-btn" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
                Search
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Filter and Results */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Filter className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Filter Resources
          </span>
        </div>

        {/* Type filters */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {RESOURCE_TYPES.map((type) => (
            <button
              key={type.name}
              type="button"
              onClick={() => setSelectedType(type.name)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedType === type.name
                  ? "text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              style={selectedType === type.name ? { backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' } : {}}
            >
              {type.name} ({type.count})
            </button>
          ))}
        </div>

        {/* Results count */}
        <div className="text-center mb-8">
          <p className="text-slate-600">
            Showing {filteredResources.length} of {ALL_RESOURCES.length} resources
            {searchQuery && ` for "${searchQuery}"`}
            {selectedType !== "All" && ` in ${selectedType}`}
          </p>
        </div>

        {/* Results Grid */}
        <div className="ca-resources-featured-grid">
          {filteredResources.length > 0 ? (
            filteredResources.map((resource) => {
              const TypeIcon = resource.typeIcon
              return (
                <Link
                  key={resource.id}
                  href={resource.href}
                  className={`ca-resources-featured-card ${resource.featured ? "ca-resources-featured-card-highlight" : ""}`}
                >
                  {resource.featured && (
                    <div className="ca-resources-featured-badge">Featured</div>
                  )}
                  <div className="flex items-center gap-2 mb-2">
                    <TypeIcon className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    <span className="text-xs font-medium text-slate-500">{resource.type}</span>
                    <span className="text-slate-300">|</span>
                    <span className="ca-resources-featured-category">{resource.category}</span>
                  </div>
                  <h3 className="ca-resources-featured-title">{resource.title}</h3>
                  <p className="ca-resources-featured-desc">{resource.description}</p>
                  <div className="ca-resources-featured-tags">
                    {resource.tags.map((tag) => (
                      <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                    ))}
                  </div>
                  <div className="ca-resources-featured-meta">
                    <div className="ca-resources-featured-meta-left">
                      <Clock className="w-4 h-4" aria-hidden="true" />
                      <span>{resource.readTime}</span>
                      <span>{resource.date}</span>
                    </div>
                    <ArrowRight className="w-5 h-5" aria-hidden="true" />
                  </div>
                </Link>
              )
            })
          ) : (
            <div className="ca-resources-no-results col-span-full">
              <p>No resources found matching your criteria. Try different keywords or filters.</p>
              <button
                type="button"
                onClick={() => { setSearchQuery(""); setSelectedType("All"); }}
                className="mt-4 text-sm font-medium text-slate-900 font-semibold"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Get Started
          </div>
          <h2 className="ca-final-cta-title">Ready to Optimize Your Cloud Costs?</h2>
          <p className="ca-final-cta-subtitle">
            Start your free trial and put these resources to work.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/resources" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Back to Resources Hub
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
