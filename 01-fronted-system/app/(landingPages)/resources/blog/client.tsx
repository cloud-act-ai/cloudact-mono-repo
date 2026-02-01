"use client"

import Link from "next/link"
import {
  ArrowRight,
  Newspaper,
  Clock,
  TrendingUp,
  Zap,
  DollarSign,
  Cloud,
  Sparkles,
  ArrowLeft,
} from "lucide-react"

// Blog posts data
const BLOG_POSTS = [
  {
    id: "genai-cost-management",
    category: "GenAI",
    title: "GenAI Cost Management Best Practices",
    description: "Essential strategies for controlling and optimizing costs in your GenAI and LLM applications.",
    readTime: "10 min read",
    date: "Dec 12, 2024",
    tags: ["GenAI", "LLM", "Cost Control"],
    featured: true,
  },
  {
    id: "multi-cloud-strategy",
    category: "Strategy",
    title: "Building a Multi-Cloud Cost Strategy",
    description: "How to manage and optimize costs across AWS, GCP, and Azure without losing visibility.",
    readTime: "8 min read",
    date: "Dec 8, 2024",
    tags: ["Multi-Cloud", "Strategy", "Best Practices"],
  },
  {
    id: "finops-team-building",
    category: "FinOps",
    title: "Building a FinOps Culture in Your Organization",
    description: "Practical steps to embed cost awareness into your engineering and product teams.",
    readTime: "12 min read",
    date: "Dec 5, 2024",
    tags: ["FinOps", "Culture", "Teams"],
  },
  {
    id: "kubernetes-cost-optimization",
    category: "Cloud",
    title: "Kubernetes Cost Optimization Strategies",
    description: "Reduce your Kubernetes spend by up to 40% with these proven optimization techniques.",
    readTime: "15 min read",
    date: "Nov 28, 2024",
    tags: ["Kubernetes", "Containers", "Optimization"],
  },
  {
    id: "reserved-instances-guide",
    category: "Cloud",
    title: "Reserved Instances: When to Commit",
    description: "A data-driven approach to reserved instance purchases across major cloud providers.",
    readTime: "9 min read",
    date: "Nov 22, 2024",
    tags: ["Reserved Instances", "Savings", "Planning"],
  },
  {
    id: "ai-anomaly-detection",
    category: "Product",
    title: "How AI-Powered Anomaly Detection Works",
    description: "Behind the scenes of CloudAct's anomaly detection system and how it catches cost spikes.",
    readTime: "7 min read",
    date: "Nov 15, 2024",
    tags: ["AI", "Anomaly Detection", "Product"],
  },
]

// Popular topics
const POPULAR_TOPICS = [
  { name: "Cost Optimization", icon: TrendingUp },
  { name: "GenAI & LLMs", icon: Zap },
  { name: "Multi-Cloud", icon: Cloud },
  { name: "ROI Analysis", icon: DollarSign },
]

export function BlogPageClient() {
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
            <Newspaper className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Blog
          </div>
          <h1 className="ca-page-hero-title">
            Insights &amp;{" "}
            <span className="font-semibold">Best Practices</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            The latest thinking on cloud cost optimization, FinOps, and GenAI cost management
            from the CloudAct.ai team.
          </p>

          {/* Popular Topics */}
          <div className="ca-resources-topics">
            <span className="ca-resources-topics-label">Popular:</span>
            {POPULAR_TOPICS.map((topic) => {
              const Icon = topic.icon
              return (
                <button
                  type="button"
                  key={topic.name}
                  className="ca-resources-topic-btn"
                >
                  <Icon className="w-4 h-4" aria-hidden="true" />
                  {topic.name}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      {/* Blog Posts Grid */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Latest Articles
          </span>
          <h2 className="ca-section-title">Featured Posts</h2>
          <p className="ca-section-subtitle">
            {BLOG_POSTS.length} articles to help you master cloud cost optimization
          </p>
        </div>

        <div className="ca-resources-featured-grid">
          {BLOG_POSTS.map((post) => (
            <Link
              key={post.id}
              href={`/resources/blog/${post.id}`}
              className={`ca-resources-featured-card ${post.featured ? "ca-resources-featured-card-highlight" : ""}`}
            >
              {post.featured && (
                <div className="ca-resources-featured-badge">Featured</div>
              )}
              <div className="ca-resources-featured-category">{post.category}</div>
              <h3 className="ca-resources-featured-title">{post.title}</h3>
              <p className="ca-resources-featured-desc">{post.description}</p>
              <div className="ca-resources-featured-tags">
                {post.tags.map((tag) => (
                  <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                ))}
              </div>
              <div className="ca-resources-featured-meta">
                <div className="ca-resources-featured-meta-left">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{post.readTime}</span>
                  <span>{post.date}</span>
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
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Start Optimizing
          </div>
          <h2 className="ca-final-cta-title">Ready to Cut Cloud Costs?</h2>
          <p className="ca-final-cta-subtitle">
            Put these insights into action with CloudAct.ai's unified cost platform.
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
