import type { Metadata } from "next"
import Link from "next/link"
import {
  Shield,
  FileText,
  Scale,
  Lock,
  Globe,
  AlertTriangle,
  Mail,
  ArrowRight,
  CheckCircle2,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Compliance | CloudAct.ai",
  description: "CloudAct.ai Compliance standards. SOC 2 Type II certified, GDPR and CCPA compliant. Learn about our commitment to data protection.",
  openGraph: {
    title: "Compliance | CloudAct.ai",
    description: "SOC 2 Type II certified, GDPR and CCPA compliant platform.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const CERTIFICATIONS = [
  {
    title: "SOC 2 Type II",
    icon: Shield,
    description: "Annual third-party audits verify our security controls meet AICPA standards.",
  },
  {
    title: "GDPR",
    icon: Globe,
    description: "Compliant with European Union General Data Protection Regulation requirements.",
  },
  {
    title: "CCPA",
    icon: Lock,
    description: "Compliant with California Consumer Privacy Act data protection standards.",
  },
]

export default function CompliancePage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Scale className="w-4 h-4" />
            Compliance Standards
          </div>
          <h1 className="ca-page-hero-title">
            Compliance at <span className="ca-hero-highlight-mint">CloudAct</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            We maintain rigorous compliance standards to ensure your data is handled with the
            highest level of care and regulatory adherence.
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
            <Link href="/security" className="ca-legal-nav-link">
              <Lock className="w-4 h-4" />
              Security
            </Link>
            <Link href="/compliance" className="ca-legal-nav-link active">
              <Scale className="w-4 h-4" />
              Compliance
            </Link>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="ca-legal-content-section">
        <div className="ca-legal-content">
          {/* Certifications Grid */}
          <div className="ca-legal-certs-grid">
            {CERTIFICATIONS.map((cert) => {
              const Icon = cert.icon
              return (
                <div key={cert.title} className="ca-legal-cert-card">
                  <div className="ca-legal-cert-icon">
                    <Icon className="w-8 h-8" />
                  </div>
                  <h3 className="ca-legal-cert-title">{cert.title}</h3>
                  <p className="ca-legal-cert-desc">{cert.description}</p>
                </div>
              )
            })}
          </div>

          {/* Important Disclaimer */}
          <div className="ca-legal-alert">
            <AlertTriangle className="ca-legal-alert-icon" />
            <div className="ca-legal-alert-content">
              <h3>Important Disclaimer</h3>
              <p>
                While CloudAct.ai maintains these compliance certifications, they do not guarantee absolute security
                or immunity from data breaches. No system is 100% secure. We strongly recommend always using
                <strong> READ-ONLY API keys</strong> when connecting cloud providers, regularly rotating and
                auditing your credentials, and implementing your own security best practices.
              </p>
            </div>
          </div>

          {/* Data Protection Measures */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Data Protection Measures</h2>
            <ul className="ca-legal-list">
              <li><strong>Encryption:</strong> AES-256 at rest, TLS 1.3 in transit</li>
              <li><strong>Data Residency:</strong> Data stored in Google Cloud Platform (US regions)</li>
              <li><strong>Access Controls:</strong> Role-based access, MFA, audit logging</li>
              <li><strong>Data Retention:</strong> Configurable retention policies per organization</li>
            </ul>
          </div>

          {/* Your Data Rights */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Your Data Rights</h2>
            <p className="ca-legal-section-text">
              Under GDPR and CCPA, you have the following rights:
            </p>
            <ul className="ca-legal-list">
              <li><strong>Right to Access:</strong> Request a copy of your personal data</li>
              <li><strong>Right to Rectification:</strong> Correct inaccurate personal data</li>
              <li><strong>Right to Erasure:</strong> Request deletion of your personal data</li>
              <li><strong>Right to Portability:</strong> Export your data in a machine-readable format</li>
              <li><strong>Right to Opt-Out:</strong> Opt out of data sales (we do not sell data)</li>
            </ul>
            <p className="ca-legal-section-text">
              To exercise these rights, contact us at{" "}
              <a href="mailto:privacy@cloudact.ai" style={{ color: "#1a7a3a", fontWeight: 600 }}>
                privacy@cloudact.ai
              </a>
            </p>
          </div>

          {/* Third-Party Sub-processors */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Third-Party Sub-processors</h2>
            <p className="ca-legal-section-text">
              We use the following sub-processors to deliver our services:
            </p>
            <ul className="ca-legal-list">
              <li><strong>Google Cloud Platform:</strong> Infrastructure and data storage (US)</li>
              <li><strong>Stripe:</strong> Payment processing</li>
              <li><strong>Supabase:</strong> Authentication services</li>
            </ul>
          </div>

          {/* Limitation of Liability */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Limitation of Liability</h2>
            <p className="ca-legal-section-text">
              Compliance certifications and security measures do not constitute a guarantee against data breaches.
              CloudAct.ai assumes <strong>zero liability</strong> for security incidents arising from factors outside
              our direct control, including but not limited to:
            </p>
            <ul className="ca-legal-list">
              <li>Credentials provided with excessive permissions (non-read-only)</li>
              <li>Security incidents at third-party cloud providers</li>
              <li>User failure to follow security best practices</li>
              <li>Nation-state attacks or advanced persistent threats</li>
            </ul>
          </div>

          {/* Contact */}
          <div className="ca-legal-contact">
            <h3 className="ca-legal-contact-title">Compliance Contact</h3>
            <p className="ca-legal-section-text" style={{ marginBottom: "1rem" }}>
              For compliance inquiries, contact us:
            </p>
            <a href="mailto:compliance@cloudact.ai" className="ca-legal-contact-email">
              <Mail className="w-5 h-5" />
              compliance@cloudact.ai
            </a>
            <p className="ca-legal-contact-address">
              <strong>CloudAct Inc.</strong><br />
              100 S Murphy Ave, STE 200 PMB4013<br />
              Sunnyvale, CA 94086<br />
              United States<br />
              Phone: (850) 988-7471
            </p>
            <div className="ca-legal-links">
              <Link href="/privacy" className="ca-legal-link">Privacy Policy</Link>
              <Link href="/terms" className="ca-legal-link">Terms of Service</Link>
              <Link href="/security" className="ca-legal-link">Security</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Questions About Compliance?</h2>
          <p className="ca-final-cta-subtitle">
            Our compliance team is here to help with your regulatory and data protection questions.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/contact" className="ca-btn-cta-primary">
              Contact Compliance Team
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/security" className="ca-btn-cta-secondary">
              View Security
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
