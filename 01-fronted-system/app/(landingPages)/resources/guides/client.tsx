"use client"

import Link from "next/link"
import {
  ArrowRight,
  BookOpen,
  Clock,
  GraduationCap,
  Sparkles,
  ArrowLeft,
  CheckCircle,
} from "lucide-react"

// Guides data
const GUIDES = [
  {
    id: "complete-cloud-cost",
    category: "Getting Started",
    title: "Complete Guide to Cloud Cost Optimization",
    description: "Learn proven strategies to optimize your cloud spending while maintaining performance and reliability.",
    readTime: "15 min read",
    date: "Dec 18, 2024",
    tags: ["Cost Optimization", "Best Practices", "Strategy"],
    featured: true,
    chapters: 8,
  },
  {
    id: "genai-cost-tracking",
    category: "GenAI",
    title: "Tracking GenAI & LLM Costs",
    description: "Step-by-step guide to monitoring and attributing costs across OpenAI, Anthropic, and other AI providers.",
    readTime: "12 min read",
    date: "Dec 14, 2024",
    tags: ["GenAI", "LLM", "Attribution"],
    chapters: 6,
  },
  {
    id: "multi-cloud-setup",
    category: "Setup",
    title: "Multi-Cloud Integration Setup",
    description: "Connect AWS, GCP, Azure, and OCI to CloudAct in minutes with our integration guide.",
    readTime: "10 min read",
    date: "Dec 10, 2024",
    tags: ["Integration", "Multi-Cloud", "Setup"],
    chapters: 5,
  },
  {
    id: "tagging-strategy",
    category: "Best Practices",
    title: "Building a Cost Tagging Strategy",
    description: "Design and implement a tagging strategy that enables 100% cost allocation across your organization.",
    readTime: "14 min read",
    date: "Dec 5, 2024",
    tags: ["Tagging", "Allocation", "Governance"],
    chapters: 7,
  },
  {
    id: "anomaly-detection-setup",
    category: "Features",
    title: "Configuring Anomaly Detection",
    description: "Set up intelligent anomaly detection to catch cost spikes before they become budget busters.",
    readTime: "8 min read",
    date: "Nov 28, 2024",
    tags: ["Anomaly Detection", "Alerts", "Monitoring"],
    chapters: 4,
  },
  {
    id: "team-onboarding",
    category: "Teams",
    title: "Onboarding Your Team to CloudAct",
    description: "Best practices for rolling out CloudAct across engineering and finance teams.",
    readTime: "11 min read",
    date: "Nov 20, 2024",
    tags: ["Teams", "Onboarding", "Adoption"],
    chapters: 6,
  },
]

// Learning paths
const LEARNING_PATHS = [
  {
    title: "Beginner",
    description: "New to cloud cost optimization",
    guides: 4,
  },
  {
    title: "Intermediate",
    description: "Ready for advanced strategies",
    guides: 6,
  },
  {
    title: "Expert",
    description: "Enterprise-scale optimization",
    guides: 5,
  },
]

export function GuidesPageClient() {
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
            <BookOpen className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Guides
          </div>
          <h1 className="ca-page-hero-title">
            Step-by-Step{" "}
            <span className="font-semibold">Tutorials</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Comprehensive guides to help you master cloud cost optimization and get the most from CloudAct.ai.
          </p>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="ca-resources-categories-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <GraduationCap className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Learning Paths
          </span>
          <h2 className="ca-section-title">Choose Your Path</h2>
          <p className="ca-section-subtitle">
            Structured learning tracks based on your experience level
          </p>
        </div>

        <div className="ca-resources-categories-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {LEARNING_PATHS.map((path) => (
            <div
              key={path.title}
              className="ca-resources-category-card ca-resources-category-mint"
            >
              <div className="ca-resources-category-icon ca-resources-category-icon-mint">
                <GraduationCap className="w-7 h-7" aria-hidden="true" />
              </div>
              <h3 className="ca-resources-category-title">{path.title}</h3>
              <p className="ca-resources-category-desc">{path.description}</p>
              <div className="ca-resources-category-footer">
                <span className="ca-resources-category-count">{path.guides} Guides</span>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Guides Grid */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            All Guides
          </span>
          <h2 className="ca-section-title">Browse Tutorials</h2>
          <p className="ca-section-subtitle">
            {GUIDES.length} in-depth guides to help you succeed
          </p>
        </div>

        <div className="ca-resources-featured-grid">
          {GUIDES.map((guide) => (
            <Link
              key={guide.id}
              href={`/resources/guides/${guide.id}`}
              className={`ca-resources-featured-card ${guide.featured ? "ca-resources-featured-card-highlight" : ""}`}
            >
              {guide.featured && (
                <div className="ca-resources-featured-badge">Featured</div>
              )}
              <div className="ca-resources-featured-category">{guide.category}</div>
              <h3 className="ca-resources-featured-title">{guide.title}</h3>
              <p className="ca-resources-featured-desc">{guide.description}</p>
              <div className="ca-resources-featured-tags">
                {guide.tags.map((tag) => (
                  <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                ))}
              </div>
              <div className="ca-resources-featured-meta">
                <div className="ca-resources-featured-meta-left">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{guide.readTime}</span>
                  <span>{guide.chapters} chapters</span>
                </div>
                <ArrowRight className="w-5 h-5" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <CheckCircle className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Get Started
          </div>
          <h2 className="ca-final-cta-title">Ready to Apply What You've Learned?</h2>
          <p className="ca-final-cta-subtitle">
            Start your free trial and put these strategies into practice.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/resources" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Browse All Resources
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
