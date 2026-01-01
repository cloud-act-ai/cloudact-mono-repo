"use client"

import { useState, useMemo, type FormEvent } from "react"
import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Video,
  Users,
  FileCode,
  Newspaper,
  GraduationCap,
  PlayCircle,
  Briefcase,
  Search,
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
  Clock,
  Sparkles,
  Library,
  Folders,
  Star,
} from "lucide-react"
import { NewsletterForm } from "@/components/landing/newsletter-form"
import "../premium.css"

// Resource categories
const CATEGORIES = [
  {
    id: "blog",
    icon: Newspaper,
    title: "Blog",
    description: "Latest insights on cost optimization",
    count: "Articles",
    color: "mint",
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
    color: "blue",
  },
  {
    id: "case-studies",
    icon: Briefcase,
    title: "Case Studies",
    description: "Real-world success stories",
    count: "Stories",
    color: "purple",
  },
  {
    id: "documentation",
    icon: FileCode,
    title: "Documentation",
    description: "Complete API reference",
    count: "Reference",
    color: "mint",
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

// Featured resources
const FEATURED_RESOURCES = [
  {
    id: "guide-cloud-cost",
    category: "Guide",
    title: "Complete Guide to Cloud Cost Optimization",
    description: "Learn proven strategies to optimize your cloud spending while maintaining performance and reliability.",
    readTime: "15 min read",
    date: "Dec 18, 2024",
    tags: ["Cost Optimization", "Best Practices", "Strategy"],
    href: "/resources/guides",
    featured: true,
  },
  {
    id: "case-study-enterprise",
    category: "Case Study",
    title: "Enterprise Cloud Cost Optimization",
    description: "Discover how enterprise teams use CloudAct.ai's advanced analytics to gain visibility and reduce cloud costs.",
    readTime: "8 min read",
    date: "Dec 15, 2024",
    tags: ["Success Story", "Enterprise", "ROI"],
    href: "/resources/case-studies",
  },
  {
    id: "blog-genai-cost",
    category: "Blog",
    title: "GenAI Cost Management Best Practices",
    description: "Essential strategies for controlling and optimizing costs in your GenAI and LLM applications.",
    readTime: "10 min read",
    date: "Dec 12, 2024",
    tags: ["GenAI", "LLM", "Cost Control"],
    href: "/resources/blog",
  },
  {
    id: "video-getting-started",
    category: "Video Tutorial",
    title: "Getting Started with CloudAct.ai",
    description: "A comprehensive walkthrough of setting up your first organization and running cost analysis pipelines.",
    readTime: "12 min watch",
    date: "Dec 10, 2024",
    tags: ["Tutorial", "Setup", "Beginner"],
    href: "/docs/quick-start",
  },
  {
    id: "docs-api-reference",
    category: "Documentation",
    title: "API Reference & Integration Guide",
    description: "Complete documentation for integrating CloudAct.ai with your cloud providers and existing workflows.",
    readTime: "Reference",
    date: "Updated Dec 20",
    tags: ["API", "Integration", "Developer"],
    href: "/docs/api/reference",
  },
  {
    id: "webinar-2025-trends",
    category: "Webinar",
    title: "Cloud Cost Optimization Trends",
    description: "Join our experts for a session on the latest trends and techniques in cloud cost management.",
    readTime: "45 min session",
    date: "Dec 5, 2024",
    tags: ["Webinar", "Expert Panel", "Trends"],
    href: "/resources/webinars",
  },
]

// Popular topics
const POPULAR_TOPICS = [
  { name: "Cost Optimization", icon: TrendingUp },
  { name: "GenAI & LLMs", icon: Zap },
  { name: "API Integration", icon: Code },
  { name: "Multi-Cloud", icon: Cloud },
  { name: "ROI Analysis", icon: DollarSign },
  { name: "Analytics", icon: BarChart3 },
]

// Downloads
const POPULAR_DOWNLOADS = [
  {
    title: "Cloud Cost Optimization Checklist",
    type: "PDF",
    size: "2.4 MB",
    label: "Popular",
    href: "/resources/documentation",
  },
  {
    title: "GenAI Cost Calculator Template",
    type: "Excel",
    size: "156 KB",
    label: "New",
    href: "/resources/documentation",
  },
  {
    title: "Multi-Cloud Strategy Guide",
    type: "PDF",
    size: "3.1 MB",
    label: "Featured",
    href: "/resources/documentation",
  },
]

// Quick links
const QUICK_LINKS = [
  {
    title: "Learning Paths",
    description: "Structured courses from beginner to advanced cloud cost optimization",
    icon: GraduationCap,
    href: "/learning-paths",
    cta: "Start Learning",
    color: "mint",
  },
  {
    title: "Community Forum",
    description: "Connect with experts and peers to share insights and best practices",
    icon: Users,
    href: "/community",
    cta: "Join Community",
    color: "coral",
  },
  {
    title: "Developer Docs",
    description: "Complete API reference, SDKs, and integration guides for developers",
    icon: Code,
    href: "/docs",
    cta: "View Docs",
    color: "blue",
  },
]

export default function ResourcesPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)

  // Filter featured resources based on search and topic
  const filteredResources = useMemo(() => {
    return FEATURED_RESOURCES.filter((resource) => {
      const matchesSearch = searchQuery === "" ||
        resource.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resource.tags.some((tag) => tag.toLowerCase().includes(searchQuery.toLowerCase()))

      const matchesTopic = selectedTopic === null ||
        resource.tags.some((tag) => tag.toLowerCase().includes(selectedTopic.toLowerCase())) ||
        resource.title.toLowerCase().includes(selectedTopic.toLowerCase())

      return matchesSearch && matchesTopic
    })
  }, [searchQuery, selectedTopic])

  const handleSearch = (e: FormEvent) => {
    e.preventDefault()
    // Search is already reactive via state
  }

  const handleTopicClick = (topicName: string) => {
    setSelectedTopic((prev) => prev === topicName ? null : topicName)
  }

  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Library className="w-4 h-4" aria-hidden="true" />
            Knowledge Hub
          </div>
          <h1 className="ca-page-hero-title">
            Resources &amp;{" "}
            <span className="ca-hero-highlight-mint">Learning Center</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Everything you need to master cloud cost optimization - from guides and tutorials
            to case studies and API documentation
          </p>

          {/* Search Bar */}
          <form className="ca-resources-search" role="search" aria-label="Search resources" onSubmit={handleSearch}>
            <div className="ca-resources-search-inner">
              <Search className="w-5 h-5" aria-hidden="true" />
              <input
                type="search"
                placeholder="Search resources, guides, tutorials..."
                className="ca-resources-search-input"
                aria-label="Search resources"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <button type="submit" className="ca-btn-hero-primary ca-resources-search-btn">
                Search
              </button>
            </div>
          </form>

          {/* Popular Topics */}
          <div className="ca-resources-topics">
            <span className="ca-resources-topics-label">Popular:</span>
            {POPULAR_TOPICS.map((topic) => {
              const Icon = topic.icon
              return (
                <button
                  type="button"
                  key={topic.name}
                  className={`ca-resources-topic-btn ${selectedTopic === topic.name ? "ca-resources-topic-btn-active" : ""}`}
                  onClick={() => handleTopicClick(topic.name)}
                  aria-pressed={selectedTopic === topic.name}
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {topic.name}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Resource Categories */}
      <section className="ca-resources-categories-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Folders className="w-4 h-4" aria-hidden="true" />
            Browse by Category
          </span>
          <h2 className="ca-section-title">Explore Our Resources</h2>
          <p className="ca-section-subtitle">
            Choose from our comprehensive collection of learning materials and resources
          </p>
        </div>

        <div className="ca-resources-categories-grid">
          {CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <Link
                key={category.id}
                id={category.id}
                href={`/resources/${category.id}`}
                className={`ca-resources-category-card ca-resources-category-${category.color}`}
              >
                <div className={`ca-resources-category-icon ca-resources-category-icon-${category.color}`}>
                  <Icon className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="ca-resources-category-title">{category.title}</h3>
                <p className="ca-resources-category-desc">{category.description}</p>
                <div className="ca-resources-category-footer">
                  <span className="ca-resources-category-count">{category.count}</span>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Featured Resources */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Star className="w-4 h-4" aria-hidden="true" />
            Featured Content
          </span>
          <h2 className="ca-section-title">
            {searchQuery || selectedTopic ? "Search Results" : "Latest Resources"}
          </h2>
          {(searchQuery || selectedTopic) && (
            <p className="ca-section-subtitle">
              {filteredResources.length} resource{filteredResources.length !== 1 ? "s" : ""} found
              {selectedTopic && <button type="button" onClick={() => setSelectedTopic(null)} className="ca-resources-clear-filter">Clear filter</button>}
            </p>
          )}
        </div>

        <div className="ca-resources-featured-grid">
          {filteredResources.length > 0 ? (
            filteredResources.map((resource) => (
              <Link
                key={resource.id}
                href={resource.href}
                className={`ca-resources-featured-card ${resource.featured ? "ca-resources-featured-card-highlight" : ""}`}
              >
                {resource.featured && (
                  <div className="ca-resources-featured-badge">Featured</div>
                )}
                <div className="ca-resources-featured-category">{resource.category}</div>
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
            ))
          ) : (
            <div className="ca-resources-no-results">
              <p>No resources found matching your search. Try different keywords or clear filters.</p>
            </div>
          )}
        </div>

        <div className="ca-resources-view-all">
          <Link href="/resources/all" className="ca-btn-hero-primary">
            View All Resources
            <ArrowRight className="w-5 h-5" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Popular Downloads */}
      <section className="ca-resources-downloads-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Download className="w-4 h-4" aria-hidden="true" />
            Free Downloads
          </span>
          <h2 className="ca-section-title">Popular Resources</h2>
          <p className="ca-section-subtitle">
            Download our most popular guides, templates, and tools
          </p>
        </div>

        <div className="ca-resources-downloads-list">
          {POPULAR_DOWNLOADS.map((download) => (
            <Link
              key={download.title}
              href={download.href}
              className="ca-resources-download-card"
            >
              <div className="ca-resources-download-icon">
                <Download className="w-6 h-6" aria-hidden="true" />
              </div>
              <div className="ca-resources-download-content">
                <h3 className="ca-resources-download-title">{download.title}</h3>
                <div className="ca-resources-download-meta">
                  <span className="ca-resources-download-type">{download.type}</span>
                  <span>{download.size}</span>
                  <span className="ca-resources-download-label">{download.label}</span>
                </div>
              </div>
              <ExternalLink className="w-5 h-5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      {/* Quick Links */}
      <section className="ca-resources-quicklinks-section">
        <div className="ca-resources-quicklinks-grid">
          {QUICK_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <div key={link.title} className="ca-resources-quicklink-card">
                <div className={`ca-resources-quicklink-icon ca-resources-quicklink-icon-${link.color}`}>
                  <Icon className="w-8 h-8" aria-hidden="true" />
                </div>
                <h3 className="ca-resources-quicklink-title">{link.title}</h3>
                <p className="ca-resources-quicklink-desc">{link.description}</p>
                <Link href={link.href} className="ca-btn-hero-secondary">
                  {link.cta}
                </Link>
              </div>
            )
          })}
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="ca-resources-newsletter-section">
        <div className="ca-resources-newsletter-card">
          <div className="ca-resources-newsletter-icon">
            <Mail className="w-10 h-10" aria-hidden="true" />
          </div>
          <h2 className="ca-resources-newsletter-title">Stay Updated</h2>
          <p className="ca-resources-newsletter-desc">
            Get the latest guides, case studies, and cloud cost optimization insights
            delivered to your inbox every week
          </p>
          <NewsletterForm source="resources-page" />
          <p className="ca-resources-newsletter-note">
            Weekly insights for cloud professionals. Unsubscribe anytime.
          </p>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Start Learning Today
          </div>
          <h2 className="ca-final-cta-title">Ready to Master Cloud Costs?</h2>
          <p className="ca-final-cta-subtitle">
            Explore our resources and start optimizing your cloud spending today.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/docs" className="ca-btn-cta-secondary">
              View Documentation
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
