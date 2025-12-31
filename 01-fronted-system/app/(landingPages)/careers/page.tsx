import type { Metadata } from "next"
import Link from "next/link"
import {
  Briefcase,
  MapPin,
  Clock,
  ArrowRight,
  Users,
  Sparkles,
  Heart,
  Globe,
  Coffee,
  Zap,
  Target,
  CheckCircle2,
  Building2,
  Mail,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Careers | CloudAct.ai",
  description: "Join CloudAct.ai and help companies manage their cloud and GenAI costs. View open positions and learn about our culture.",
  openGraph: {
    title: "Careers | CloudAct.ai",
    description: "Build the future of FinOps. Join our team.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const BENEFITS = [
  {
    icon: Heart,
    title: "Health & Wellness",
    description: "Comprehensive medical, dental, and vision coverage for you and your family.",
  },
  {
    icon: Globe,
    title: "Remote-First",
    description: "Work from anywhere. We hire globally and support flexible schedules.",
  },
  {
    icon: Sparkles,
    title: "Equity",
    description: "Meaningful equity stake in a high-growth company. We succeed together.",
  },
  {
    icon: Coffee,
    title: "Unlimited PTO",
    description: "Take the time you need. We trust you to manage your work-life balance.",
  },
  {
    icon: Zap,
    title: "Learning Budget",
    description: "$2,000 annual budget for courses, conferences, and professional development.",
  },
  {
    icon: Target,
    title: "Home Office",
    description: "$1,500 stipend to set up your ideal workspace at home.",
  },
]

const VALUES = [
  {
    title: "Customer Obsession",
    description: "We deeply understand our customers' pain points and build solutions that genuinely help them.",
  },
  {
    title: "Move Fast",
    description: "We ship quickly, iterate based on feedback, and aren't afraid to make bold decisions.",
  },
  {
    title: "Ownership Mentality",
    description: "Everyone owns their work end-to-end. We take initiative and drive results.",
  },
  {
    title: "Radical Transparency",
    description: "We share context openly. Everyone has access to the information they need to make great decisions.",
  },
]

const OPEN_POSITIONS = [
  {
    title: "Senior Backend Engineer",
    department: "Engineering",
    location: "Remote (US)",
    type: "Full-time",
    description: "Build scalable data pipelines and APIs that process billions of cost records.",
  },
  {
    title: "Senior Frontend Engineer",
    department: "Engineering",
    location: "Remote (Global)",
    type: "Full-time",
    description: "Create beautiful, intuitive dashboards that help teams understand their cloud costs.",
  },
  {
    title: "Product Manager",
    department: "Product",
    location: "Remote (US/EU)",
    type: "Full-time",
    description: "Define the roadmap for our GenAI cost management features.",
  },
  {
    title: "Solutions Engineer",
    department: "Sales",
    location: "Remote (US)",
    type: "Full-time",
    description: "Help enterprise customers integrate CloudAct and optimize their cloud spend.",
  },
]

export default function CareersPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Briefcase className="w-4 h-4" />
            Careers
          </div>
          <h1 className="ca-page-hero-title">
            Build the Future of <span className="ca-hero-highlight-mint">FinOps</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Join our mission to help companies optimize their cloud and GenAI spending.
            We're a remote-first team building the next generation of cost intelligence.
          </p>
          <div className="ca-hero-cta-group">
            <a href="#positions" className="ca-btn-hero-primary">
              View Open Positions
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="ca-careers-stats">
        <div className="ca-careers-stats-grid">
          <div className="ca-careers-stat">
            <span className="ca-careers-stat-value">20+</span>
            <span className="ca-careers-stat-label">Team Members</span>
          </div>
          <div className="ca-careers-stat">
            <span className="ca-careers-stat-value">8</span>
            <span className="ca-careers-stat-label">Countries</span>
          </div>
          <div className="ca-careers-stat">
            <span className="ca-careers-stat-value">100%</span>
            <span className="ca-careers-stat-label">Remote</span>
          </div>
          <div className="ca-careers-stat">
            <span className="ca-careers-stat-value">Series A</span>
            <span className="ca-careers-stat-label">Funded</span>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="ca-careers-values-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Target className="w-4 h-4" />
            Our Values
          </span>
          <h2 className="ca-section-title">What drives us</h2>
          <p className="ca-section-subtitle">
            Our values guide how we work together and serve our customers.
          </p>
        </div>

        <div className="ca-careers-values-grid">
          {VALUES.map((value, i) => (
            <div key={i} className="ca-careers-value-card">
              <div className="ca-careers-value-number">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="ca-careers-value-title">{value.title}</h3>
              <p className="ca-careers-value-desc">{value.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="ca-careers-benefits-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Heart className="w-4 h-4" />
            Benefits
          </span>
          <h2 className="ca-section-title">Taking care of our team</h2>
          <p className="ca-section-subtitle">
            Competitive compensation and benefits that support your whole life.
          </p>
        </div>

        <div className="ca-careers-benefits-grid">
          {BENEFITS.map((benefit, i) => {
            const Icon = benefit.icon
            return (
              <div key={i} className="ca-careers-benefit-card">
                <div className="ca-careers-benefit-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="ca-careers-benefit-title">{benefit.title}</h3>
                <p className="ca-careers-benefit-desc">{benefit.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Open Positions Section */}
      <section id="positions" className="ca-careers-positions-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Users className="w-4 h-4" />
            Open Positions
          </span>
          <h2 className="ca-section-title">Join our team</h2>
          <p className="ca-section-subtitle">
            We're always looking for talented people to join us.
          </p>
        </div>

        <div className="ca-careers-positions-list">
          {OPEN_POSITIONS.map((position, i) => (
            <div key={i} className="ca-careers-position-card">
              <div className="ca-careers-position-content">
                <h3 className="ca-careers-position-title">{position.title}</h3>
                <p className="ca-careers-position-desc">{position.description}</p>
                <div className="ca-careers-position-meta">
                  <span className="ca-careers-position-tag">
                    <Briefcase className="w-4 h-4" />
                    {position.department}
                  </span>
                  <span className="ca-careers-position-tag">
                    <MapPin className="w-4 h-4" />
                    {position.location}
                  </span>
                  <span className="ca-careers-position-tag">
                    <Clock className="w-4 h-4" />
                    {position.type}
                  </span>
                </div>
              </div>
              <Link href={`/careers/apply?position=${encodeURIComponent(position.title)}`} className="ca-careers-apply-btn">
                Apply
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ))}
        </div>

        {/* No positions fallback message */}
        <div className="ca-careers-general-apply">
          <p>Don't see a role that fits? We're always interested in hearing from talented people.</p>
          <Link href="/careers/apply?position=General%20Application" className="ca-btn-outline-dark">
            <Mail className="w-4 h-4" />
            Submit General Application
          </Link>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Ready to make an impact?</h2>
          <p className="ca-final-cta-subtitle">
            Join a team that's helping companies save millions on their cloud and AI costs.
          </p>
          <div className="ca-final-cta-buttons">
            <a href="#positions" className="ca-btn-cta-primary">
              View Open Positions
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
