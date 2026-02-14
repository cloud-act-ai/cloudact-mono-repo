"use client"

import Link from "next/link"
import { site } from "@/lib/site"
import {
  ArrowRight,
  Video,
  Clock,
  Play,
  Sparkles,
  ArrowLeft,
  MonitorPlay,
} from "lucide-react"

// Videos data
const VIDEOS = [
  {
    id: "getting-started",
    category: "Tutorial",
    title: `Getting Started with ${site.name}`,
    description: "A comprehensive walkthrough of setting up your first organization and running cost analysis pipelines.",
    duration: "12 min",
    date: "Dec 10, 2024",
    tags: ["Tutorial", "Setup", "Beginner"],
    featured: true,
  },
  {
    id: "dashboard-overview",
    category: "Product Tour",
    title: "Dashboard Overview & Navigation",
    description: "Learn how to navigate the CloudAct dashboard and find the insights you need quickly.",
    duration: "8 min",
    date: "Dec 5, 2024",
    tags: ["Dashboard", "Navigation", "Basics"],
  },
  {
    id: "connect-aws",
    category: "Integration",
    title: "Connecting AWS to CloudAct.ai",
    description: "Step-by-step guide to setting up AWS cost and usage report integration.",
    duration: "6 min",
    date: "Nov 28, 2024",
    tags: ["AWS", "Integration", "Setup"],
  },
  {
    id: "connect-gcp",
    category: "Integration",
    title: "Connecting GCP to CloudAct.ai",
    description: "Learn how to connect your Google Cloud billing export to CloudAct.",
    duration: "5 min",
    date: "Nov 25, 2024",
    tags: ["GCP", "Integration", "Setup"],
  },
  {
    id: "genai-tracking",
    category: "Features",
    title: "Tracking GenAI & LLM Costs",
    description: "See how to monitor and attribute costs across OpenAI, Anthropic, and other AI providers.",
    duration: "10 min",
    date: "Nov 20, 2024",
    tags: ["GenAI", "LLM", "Tracking"],
  },
  {
    id: "anomaly-alerts",
    category: "Features",
    title: "Setting Up Anomaly Alerts",
    description: "Configure intelligent alerts to catch cost spikes before they impact your budget.",
    duration: "7 min",
    date: "Nov 15, 2024",
    tags: ["Alerts", "Anomaly Detection", "Monitoring"],
  },
  {
    id: "cost-allocation",
    category: "Features",
    title: "Cost Allocation & Tagging",
    description: "Learn how to achieve 100% cost allocation with CloudAct's tagging features.",
    duration: "9 min",
    date: "Nov 10, 2024",
    tags: ["Allocation", "Tagging", "Attribution"],
  },
  {
    id: "team-management",
    category: "Admin",
    title: "Team Management & Permissions",
    description: "Configure team access, roles, and permissions for your organization.",
    duration: "6 min",
    date: "Nov 5, 2024",
    tags: ["Teams", "Permissions", "Admin"],
  },
]

// Video categories
const VIDEO_CATEGORIES = [
  { name: "All Videos", count: VIDEOS.length },
  { name: "Tutorials", count: 3 },
  { name: "Integrations", count: 2 },
  { name: "Features", count: 3 },
]

export function VideosPageClient() {
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
            <Video className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Video Tutorials
          </div>
          <h1 className="ca-page-hero-title">
            Learn by{" "}
            <span className="font-semibold">Watching</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Quick video tutorials and walkthroughs to help you get the most from CloudAct.ai.
          </p>

          {/* Category filters */}
          <div className="ca-resources-topics">
            {VIDEO_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.name}
                className="ca-resources-topic-btn"
              >
                {cat.name} ({cat.count})
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Video */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <MonitorPlay className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Start Here
          </span>
          <h2 className="ca-section-title">Featured Tutorial</h2>
          <p className="ca-section-subtitle">
            New to CloudAct? Start with this comprehensive getting started guide.
          </p>
        </div>

        <div className="max-w-3xl mx-auto mb-16">
          {VIDEOS.filter(v => v.featured).map((video) => (
            <Link
              key={video.id}
              href={`/resources/videos/${video.id}`}
              className="ca-resources-featured-card ca-resources-featured-card-highlight block"
            >
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-16 h-16 rounded-xl bg-slate-100 flex items-center justify-center">
                  <Play className="w-8 h-8 text-slate-600" aria-hidden="true" />
                </div>
                <div className="flex-grow">
                  <div className="ca-resources-featured-badge mb-2">Featured</div>
                  <h3 className="ca-resources-featured-title">{video.title}</h3>
                  <p className="ca-resources-featured-desc">{video.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {video.duration}
                    </span>
                    <span>{video.date}</span>
                  </div>
                </div>
                <ArrowRight className="w-6 h-6 text-slate-400 flex-shrink-0" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* All Videos Grid */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Video Library
          </span>
          <h2 className="ca-section-title">All Tutorials</h2>
          <p className="ca-section-subtitle">
            {VIDEOS.length} video tutorials to help you succeed
          </p>
        </div>

        <div className="ca-resources-featured-grid">
          {VIDEOS.filter(v => !v.featured).map((video) => (
            <Link
              key={video.id}
              href={`/resources/videos/${video.id}`}
              className="ca-resources-featured-card"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <Play className="w-5 h-5 text-slate-600" aria-hidden="true" />
                </div>
                <span className="ca-resources-featured-category">{video.category}</span>
              </div>
              <h3 className="ca-resources-featured-title">{video.title}</h3>
              <p className="ca-resources-featured-desc">{video.description}</p>
              <div className="ca-resources-featured-tags">
                {video.tags.map((tag) => (
                  <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                ))}
              </div>
              <div className="ca-resources-featured-meta">
                <div className="ca-resources-featured-meta-left">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{video.duration}</span>
                  <span>{video.date}</span>
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
            Get Started
          </div>
          <h2 className="ca-final-cta-title">{`Ready to Try ${site.name}?`}</h2>
          <p className="ca-final-cta-subtitle">
            Start your free trial and follow along with our video tutorials.
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
