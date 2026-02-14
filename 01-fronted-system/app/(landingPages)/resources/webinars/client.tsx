"use client"

import Link from "next/link"
import {
  ArrowRight,
  PlayCircle,
  Clock,
  Calendar,
  Users,
  Sparkles,
  ArrowLeft,
  Video,
} from "lucide-react"

// Webinars data
const WEBINARS = [
  {
    id: "2025-trends",
    category: "Expert Panel",
    title: "Cloud Cost Optimization Trends for 2025",
    description: "Join our experts for a session on the latest trends and techniques in cloud cost management.",
    duration: "45 min",
    date: "Jan 15, 2025",
    tags: ["Trends", "Expert Panel", "Strategy"],
    featured: true,
    upcoming: true,
    speakers: ["Sarah Chen, VP Engineering", "Mike Rodriguez, FinOps Lead"],
  },
  {
    id: "genai-cost-control",
    category: "Technical Deep Dive",
    title: "Controlling GenAI Costs at Scale",
    description: "Practical strategies for managing LLM costs across OpenAI, Anthropic, and cloud AI services.",
    duration: "60 min",
    date: "Dec 18, 2024",
    tags: ["GenAI", "LLM", "Scale"],
    upcoming: false,
    speakers: ["Alex Kim, ML Platform Lead"],
  },
  {
    id: "finops-maturity",
    category: "Strategy",
    title: "Building FinOps Maturity in Your Organization",
    description: "A roadmap for developing world-class cloud financial operations practices.",
    duration: "50 min",
    date: "Dec 5, 2024",
    tags: ["FinOps", "Maturity", "Organization"],
    upcoming: false,
    speakers: ["Jennifer Park, FinOps Director"],
  },
  {
    id: "multi-cloud-visibility",
    category: "Product Demo",
    title: "Multi-Cloud Visibility with CloudAct.ai",
    description: "See how to unify cost data across AWS, GCP, Azure, and OCI in a single dashboard.",
    duration: "30 min",
    date: "Nov 28, 2024",
    tags: ["Multi-Cloud", "Demo", "Visibility"],
    upcoming: false,
    speakers: ["CloudAct Product Team"],
  },
  {
    id: "kubernetes-optimization",
    category: "Technical Deep Dive",
    title: "Kubernetes Cost Optimization Masterclass",
    description: "Advanced techniques for reducing Kubernetes spend while maintaining performance.",
    duration: "75 min",
    date: "Nov 15, 2024",
    tags: ["Kubernetes", "Containers", "Optimization"],
    upcoming: false,
    speakers: ["David Lee, Platform Architect"],
  },
  {
    id: "customer-success-stories",
    category: "Customer Panel",
    title: "Customer Success Stories: 40% Cost Reduction",
    description: "Hear directly from customers who achieved significant cloud cost savings.",
    duration: "45 min",
    date: "Nov 5, 2024",
    tags: ["Customers", "Case Studies", "ROI"],
    upcoming: false,
    speakers: ["3 Customer Panelists"],
  },
]

export function WebinarsPageClient() {
  const upcomingWebinars = WEBINARS.filter(w => w.upcoming)
  const pastWebinars = WEBINARS.filter(w => !w.upcoming)

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
            <PlayCircle className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Webinars
          </div>
          <h1 className="ca-page-hero-title">
            Live &amp;{" "}
            <span className="font-semibold">On-Demand</span>{" "}
            Sessions
          </h1>
          <p className="ca-page-hero-subtitle">
            Expert-led webinars on cloud cost optimization, FinOps best practices, and CloudAct features.
          </p>
        </div>
      </section>

      {/* Upcoming Webinars */}
      {upcomingWebinars.length > 0 && (
        <section className="ca-resources-featured-section">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <Calendar className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
              Upcoming
            </span>
            <h2 className="ca-section-title">Register Now</h2>
            <p className="ca-section-subtitle">
              Don't miss our upcoming live sessions
            </p>
          </div>

          <div className="ca-resources-featured-grid">
            {upcomingWebinars.map((webinar) => (
              <Link
                key={webinar.id}
                href={`/resources/webinars/${webinar.id}`}
                className="ca-resources-featured-card ca-resources-featured-card-highlight"
              >
                <div className="ca-resources-featured-badge">Upcoming</div>
                <div className="ca-resources-featured-category">{webinar.category}</div>
                <h3 className="ca-resources-featured-title">{webinar.title}</h3>
                <p className="ca-resources-featured-desc">{webinar.description}</p>
                <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                  <Users className="w-4 h-4" aria-hidden="true" />
                  <span>{webinar.speakers.join(", ")}</span>
                </div>
                <div className="ca-resources-featured-tags">
                  {webinar.tags.map((tag) => (
                    <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                  ))}
                </div>
                <div className="ca-resources-featured-meta">
                  <div className="ca-resources-featured-meta-left">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    <span>{webinar.duration}</span>
                    <span>{webinar.date}</span>
                  </div>
                  <ArrowRight className="w-5 h-5" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Past Webinars */}
      <section className="ca-resources-featured-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Video className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            On-Demand
          </span>
          <h2 className="ca-section-title">Watch Anytime</h2>
          <p className="ca-section-subtitle">
            {pastWebinars.length} recorded sessions available on-demand
          </p>
        </div>

        <div className="ca-resources-featured-grid">
          {pastWebinars.map((webinar) => (
            <Link
              key={webinar.id}
              href={`/resources/webinars/${webinar.id}`}
              className="ca-resources-featured-card"
            >
              <div className="ca-resources-featured-category">{webinar.category}</div>
              <h3 className="ca-resources-featured-title">{webinar.title}</h3>
              <p className="ca-resources-featured-desc">{webinar.description}</p>
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                <Users className="w-4 h-4" aria-hidden="true" />
                <span>{webinar.speakers.join(", ")}</span>
              </div>
              <div className="ca-resources-featured-tags">
                {webinar.tags.map((tag) => (
                  <span key={tag} className="ca-resources-featured-tag">{tag}</span>
                ))}
              </div>
              <div className="ca-resources-featured-meta">
                <div className="ca-resources-featured-meta-left">
                  <Clock className="w-4 h-4" aria-hidden="true" />
                  <span>{webinar.duration}</span>
                  <span>{webinar.date}</span>
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
          <h2 className="ca-final-cta-title">Ready to Optimize Your Cloud Costs?</h2>
          <p className="ca-final-cta-subtitle">
            Start your free trial and see the savings potential for yourself.
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
