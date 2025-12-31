import type { Metadata } from "next"
import Link from "next/link"
import {
  Shield,
  FileText,
  Scale,
  Lock,
  Key,
  Eye,
  Server,
  AlertTriangle,
  Mail,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Security | CloudAct.ai",
  description: "CloudAct.ai Security practices. Learn how we protect your data with enterprise-grade security, encryption, and compliance standards.",
  openGraph: {
    title: "Security | CloudAct.ai",
    description: "Enterprise-grade security for your cloud cost data.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const SECURITY_FEATURES = [
  {
    title: "Encryption",
    icon: Lock,
    features: [
      "AES-256 encryption at rest",
      "TLS 1.3 encryption in transit",
      "Encrypted credential storage",
    ],
  },
  {
    title: "Access Control",
    icon: Key,
    features: [
      "Role-based access control (RBAC)",
      "Multi-factor authentication (MFA)",
      "SSO integration support",
    ],
  },
  {
    title: "Infrastructure",
    icon: Server,
    features: [
      "Google Cloud Platform hosting",
      "Isolated tenant environments",
      "Regular security audits",
    ],
  },
  {
    title: "Monitoring",
    icon: Eye,
    features: [
      "24/7 security monitoring",
      "Intrusion detection systems",
      "Automated threat response",
    ],
  },
]

export default function SecurityPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Lock className="w-4 h-4" />
            Enterprise Security
          </div>
          <h1 className="ca-page-hero-title">
            Security at <span className="ca-hero-highlight-mint">CloudAct</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Your data security is our top priority. We implement industry-leading security measures
            to protect your cloud cost information.
          </p>

          {/* Legal Navigation */}
          <div className="ca-legal-nav">
            <Link href="/privacy" className="ca-legal-nav-link">
              <Shield className="w-4 h-4" />
              Privacy
            </Link>
            <Link href="/terms" className="ca-legal-nav-link">
              <FileText className="w-4 h-4" />
              Terms
            </Link>
            <Link href="/security" className="ca-legal-nav-link active">
              <Lock className="w-4 h-4" />
              Security
            </Link>
            <Link href="/compliance" className="ca-legal-nav-link">
              <Scale className="w-4 h-4" />
              Compliance
            </Link>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="ca-legal-content-section">
        <div className="ca-legal-content">
          {/* Security Alert */}
          <div className="ca-legal-alert">
            <AlertTriangle className="ca-legal-alert-icon" />
            <div className="ca-legal-alert-content">
              <h3>Important Security Recommendation</h3>
              <p>
                We strongly recommend using <strong>READ-ONLY API keys and credentials</strong> at all times
                when connecting your cloud providers to CloudAct.ai. Read-only access is sufficient for cost
                monitoring and analytics, and minimizes security risk in the unlikely event of any security incident.
              </p>
            </div>
          </div>

          {/* Security Features Grid */}
          <div className="ca-legal-features-grid">
            {SECURITY_FEATURES.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title} className="ca-legal-feature-card">
                  <div className="ca-legal-feature-icon">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="ca-legal-feature-title">{feature.title}</h3>
                  <ul className="ca-legal-feature-list">
                    {feature.features.map((item) => (
                      <li key={item}>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>

          {/* Your Security Responsibilities */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Your Security Responsibilities</h2>
            <p className="ca-legal-section-text">
              Security is a shared responsibility. While we implement robust security measures, you are responsible for:
            </p>
            <ul className="ca-legal-list">
              <li><strong>Using read-only credentials</strong> — We strongly recommend read-only API keys for all integrations</li>
              <li><strong>Credential management</strong> — Regularly rotating and securely storing your credentials</li>
              <li><strong>Access management</strong> — Properly managing who has access to your CloudAct account</li>
              <li><strong>Reporting incidents</strong> — Promptly reporting any suspected security issues</li>
            </ul>
          </div>

          {/* Liability Disclaimer */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Liability Disclaimer</h2>
            <p className="ca-legal-section-text">
              CloudAct.ai assumes <strong>zero liability</strong> for any data breaches, security incidents, or
              unauthorized access arising from:
            </p>
            <ul className="ca-legal-list">
              <li>Use of credentials with write or administrative permissions</li>
              <li>Third-party cloud providers or integration services</li>
              <li>Your failure to implement recommended security practices</li>
              <li>Cyberattacks or malicious activities beyond our control</li>
            </ul>
          </div>

          {/* Report a Vulnerability */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Report a Vulnerability</h2>
            <p className="ca-legal-section-text">
              If you discover a security vulnerability, please report it responsibly. We take all security reports
              seriously and will respond promptly.
            </p>
          </div>

          {/* Contact */}
          <div className="ca-legal-contact">
            <h3 className="ca-legal-contact-title">Security Contact</h3>
            <a href="mailto:security@cloudact.ai" className="ca-legal-contact-email">
              <Mail className="w-5 h-5" />
              security@cloudact.ai
            </a>
            <p className="ca-legal-contact-address">
              <strong>CloudAct Inc.</strong><br />
              100 S Murphy Ave, STE 200 PMB4013<br />
              Sunnyvale, CA 94086<br />
              United States
            </p>
            <div className="ca-legal-links">
              <Link href="/privacy" className="ca-legal-link">Privacy Policy</Link>
              <Link href="/terms" className="ca-legal-link">Terms of Service</Link>
              <Link href="/compliance" className="ca-legal-link">Compliance</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Questions About Security?</h2>
          <p className="ca-final-cta-subtitle">
            Our security team is here to help you understand how we protect your data.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/contact" className="ca-btn-cta-primary">
              Contact Security Team
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/compliance" className="ca-btn-cta-secondary">
              View Compliance
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
