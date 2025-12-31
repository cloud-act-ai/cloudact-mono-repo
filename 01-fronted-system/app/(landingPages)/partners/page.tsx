import type { Metadata } from "next"
import Link from "next/link"
import {
  Handshake,
  ArrowRight,
  Building2,
  Globe,
  Zap,
  Users,
  Award,
  TrendingUp,
  CheckCircle2,
  Mail,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Partners | CloudAct.ai",
  description: "Partner with CloudAct.ai. Reseller, technology, and consulting partnerships. Grow your business with the leading FinOps platform.",
  openGraph: {
    title: "Partners | CloudAct.ai",
    description: "Partner with the leading FinOps platform.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const PARTNER_TYPES = [
  {
    icon: Building2,
    title: "Reseller Partners",
    description: "Resell CloudAct.ai to your customers and earn competitive margins. Get sales enablement, co-marketing support, and dedicated partner success managers.",
    benefits: ["Competitive margins", "Sales enablement", "Co-marketing funds", "Partner portal access"],
  },
  {
    icon: Zap,
    title: "Technology Partners",
    description: "Integrate your product with CloudAct.ai. Build on our platform to create powerful combined solutions for mutual customers.",
    benefits: ["API access", "Technical documentation", "Joint solution development", "Integration marketplace listing"],
  },
  {
    icon: Users,
    title: "Consulting Partners",
    description: "Deliver CloudAct.ai implementations and FinOps consulting services. Help enterprises optimize their cloud and GenAI costs.",
    benefits: ["Implementation training", "Certification program", "Lead referrals", "Professional services support"],
  },
]

const PARTNER_BENEFITS = [
  {
    icon: TrendingUp,
    title: "Revenue Growth",
    description: "Expand your offerings with a high-demand FinOps solution.",
  },
  {
    icon: Award,
    title: "Partner Certification",
    description: "Get certified and showcase your CloudAct.ai expertise.",
  },
  {
    icon: Globe,
    title: "Global Reach",
    description: "Access our worldwide customer base and partner network.",
  },
]

export default function PartnersPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Handshake className="w-4 h-4" />
            Partner Program
          </div>
          <h1 className="ca-page-hero-title">
            Grow with <span className="ca-hero-highlight-mint">CloudAct</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Join our partner ecosystem and help enterprises optimize their cloud and GenAI costs.
            Reseller, technology, and consulting partnership opportunities.
          </p>
          <div className="ca-hero-cta-group">
            <a href="mailto:partners@cloudact.ai?subject=Partnership Inquiry" className="ca-btn-hero-primary">
              Become a Partner
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link href="/contact" className="ca-btn-hero-secondary">
              Contact Us
            </Link>
          </div>
        </div>
      </section>

      {/* Partner Types Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <Building2 className="w-4 h-4" />
              Partnership Types
            </span>
            <h2 className="ca-section-title">Choose your partnership path</h2>
            <p className="ca-section-subtitle">
              We offer flexible partnership models to match your business goals.
            </p>
          </div>

          <div className="ca-partner-types-grid">
            {PARTNER_TYPES.map((type, i) => {
              const Icon = type.icon
              return (
                <div key={i} className="ca-partner-type-card">
                  <div className="ca-partner-type-icon">
                    <Icon className="w-8 h-8" />
                  </div>
                  <h3 className="ca-partner-type-title">{type.title}</h3>
                  <p className="ca-partner-type-desc">{type.description}</p>
                  <ul className="ca-partner-benefits-list">
                    {type.benefits.map((benefit, j) => (
                      <li key={j}>
                        <CheckCircle2 className="w-4 h-4" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                  <a
                    href={`mailto:partners@cloudact.ai?subject=${type.title} Inquiry`}
                    className="ca-partner-apply-btn"
                  >
                    Apply Now
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="ca-section-gray">
        <div className="ca-section-container">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow">
              <Award className="w-4 h-4" />
              Partner Benefits
            </span>
            <h2 className="ca-section-title">Why partner with CloudAct.ai?</h2>
          </div>

          <div className="ca-partner-benefits-grid">
            {PARTNER_BENEFITS.map((benefit, i) => {
              const Icon = benefit.icon
              return (
                <div key={i} className="ca-partner-benefit-card">
                  <div className="ca-partner-benefit-icon">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="ca-partner-benefit-title">{benefit.title}</h3>
                  <p className="ca-partner-benefit-desc">{benefit.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="ca-section-white">
        <div className="ca-section-container">
          <div className="ca-partner-contact">
            <h2 className="ca-partner-contact-title">Ready to partner with us?</h2>
            <p className="ca-partner-contact-desc">
              Get in touch with our partnerships team to discuss how we can work together.
            </p>
            <a href="mailto:partners@cloudact.ai" className="ca-partner-contact-email">
              <Mail className="w-5 h-5" />
              partners@cloudact.ai
            </a>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Join Our Partner Ecosystem</h2>
          <p className="ca-final-cta-subtitle">
            Partner with the leading FinOps platform and help enterprises optimize their cloud costs.
          </p>
          <div className="ca-final-cta-buttons">
            <a href="mailto:partners@cloudact.ai?subject=Partnership Inquiry" className="ca-btn-cta-primary">
              Become a Partner
              <ArrowRight className="w-5 h-5" />
            </a>
            <Link href="/about" className="ca-btn-cta-secondary">
              Learn About Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
