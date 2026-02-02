import type { Metadata } from "next"
import Link from "next/link"
import {
  Shield,
  FileText,
  Scale,
  Lock,
  AlertTriangle,
  Mail,
  Calendar,
  ArrowRight,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Privacy Policy | CloudAct.ai",
  description: "CloudAct.ai Privacy Policy. Learn how we collect, use, and protect your data. SOC 2 Type II certified, GDPR compliant.",
  openGraph: {
    title: "Privacy Policy | CloudAct.ai",
    description: "Learn how CloudAct.ai collects, uses, and protects your data.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function PrivacyPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Shield className="w-4 h-4" style={{ color: '#ffffff' }} aria-hidden="true" />
            Legal
          </div>
          <h1 className="ca-page-hero-title">
            Privacy <span className="ca-hero-highlight-mint">Policy</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Your privacy is important to us. This policy explains how we collect, use,
            and protect your information when you use CloudAct.ai.
          </p>
          <div className="ca-legal-date">
            <Calendar className="w-4 h-4" aria-hidden="true" />
            Last updated: January 2025
          </div>

          {/* Legal Navigation */}
          <div className="ca-legal-nav">
            <Link href="/privacy" className="ca-legal-nav-link active">
              <Shield className="w-4 h-4" aria-hidden="true" />
              Privacy
            </Link>
            <Link href="/terms" className="ca-legal-nav-link">
              <FileText className="w-4 h-4" aria-hidden="true" />
              Terms
            </Link>
            <Link href="/security" className="ca-legal-nav-link">
              <Lock className="w-4 h-4" aria-hidden="true" />
              Security
            </Link>
            <Link href="/compliance" className="ca-legal-nav-link">
              <Scale className="w-4 h-4" aria-hidden="true" />
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
                when connecting your cloud providers and third-party services to CloudAct.ai. Read-only access
                provides full cost monitoring and analytics capabilities while minimizing security risk.
              </p>
            </div>
          </div>

          {/* Introduction */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Introduction</h2>
            <p className="ca-legal-section-text">
              CloudAct.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you use our platform.
            </p>
          </div>

          {/* Information We Collect */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Information We Collect</h2>
            <p className="ca-legal-section-text">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="ca-legal-list">
              <li>Account information (name, email, company)</li>
              <li>Cloud provider credentials (securely encrypted)</li>
              <li>Usage data and cost information</li>
              <li>Payment information (processed by Stripe)</li>
            </ul>
          </div>

          {/* API Keys and Credentials */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">API Keys and Credentials</h2>
            <p className="ca-legal-section-text">
              When you provide API keys or credentials:
            </p>
            <ul className="ca-legal-list">
              <li>They are encrypted using industry-standard AES-256 encryption at rest</li>
              <li>They are transmitted only over TLS 1.3 encrypted connections</li>
              <li>You are solely responsible for the permission scope of credentials you provide</li>
              <li>You should use the minimum permissions necessary (read-only recommended)</li>
            </ul>
          </div>

          {/* How We Use Your Information */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">How We Use Your Information</h2>
            <p className="ca-legal-section-text">We use the information we collect to:</p>
            <ul className="ca-legal-list">
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send technical notices and support messages</li>
              <li>Monitor and analyze trends and usage</li>
            </ul>
          </div>

          {/* Data Security */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Data Security</h2>
            <p className="ca-legal-section-text">
              We implement industry-standard security measures to protect your data, including encryption at rest and
              in transit, regular security audits, and SOC 2 Type II compliance.
            </p>
          </div>

          {/* Data Breach Disclaimer */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Data Breach Disclaimer</h2>
            <p className="ca-legal-section-text">
              While we implement robust security measures, no method of transmission over the Internet or electronic
              storage is 100% secure. CloudAct.ai assumes <strong>zero liability</strong> for any data leaks, security
              breaches, or unauthorized access arising from:
            </p>
            <ul className="ca-legal-list">
              <li>Your use of credentials with write or administrative permissions instead of read-only access</li>
              <li>Third-party cloud providers, services, or integrations</li>
              <li>Cyberattacks, hacking, or malicious activities beyond our reasonable control</li>
              <li>Your failure to maintain adequate security practices for your own systems</li>
              <li>Compromise of credentials on your end before transmission to our platform</li>
            </ul>
            <p className="ca-legal-section-text">
              You acknowledge and agree that you provide credentials and data at your own risk, and we strongly
              encourage the use of read-only credentials to minimize potential exposure in any security event.
            </p>
          </div>

          {/* Data Retention */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Data Retention</h2>
            <p className="ca-legal-section-text">
              We retain your personal information for as long as necessary to fulfill the purposes outlined in this
              Privacy Policy, unless a longer retention period is required or permitted by law.
            </p>
          </div>

          {/* Your Rights */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Your Rights</h2>
            <p className="ca-legal-section-text">
              Depending on your location, you may have certain rights regarding your personal information, including
              the right to access, correct, delete, or port your data. Contact us to exercise these rights.
            </p>
          </div>

          {/* Third-Party Services */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Third-Party Services</h2>
            <p className="ca-legal-section-text">
              Our platform integrates with third-party cloud providers (AWS, Azure, GCP), GenAI providers (OpenAI,
              Anthropic, Google), and other services. We are not responsible for the privacy practices of these
              third parties. Your use of third-party services is subject to their respective privacy policies.
            </p>
          </div>

          {/* International Data Transfers */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">International Data Transfers</h2>
            <p className="ca-legal-section-text">
              Your information may be transferred to and processed in countries other than your country of residence.
              These countries may have different data protection laws. By using the platform, you consent to such
              transfers. We implement appropriate safeguards for international data transfers in compliance with
              applicable laws.
            </p>
          </div>

          {/* Children's Privacy */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Children's Privacy</h2>
            <p className="ca-legal-section-text">
              Our platform is not intended for individuals under the age of 18. We do not knowingly collect personal
              information from children. If we become aware that we have collected personal information from a child
              without parental consent, we will take steps to delete that information.
            </p>
          </div>

          {/* Changes to This Policy */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Changes to This Policy</h2>
            <p className="ca-legal-section-text">
              We may update this Privacy Policy from time to time. We will notify you of any material changes by
              posting the new Privacy Policy on this page with an updated "Last updated" date. Your continued use
              of the platform after any changes constitutes your acceptance of the modified policy.
            </p>
          </div>

          {/* Contact */}
          <div className="ca-legal-contact">
            <h3 className="ca-legal-contact-title">Contact Us</h3>
            <p className="ca-legal-section-text" style={{ marginBottom: "1rem" }}>
              If you have questions about this Privacy Policy, please contact us:
            </p>
            <a href="mailto:privacy@cloudact.ai" className="ca-legal-contact-email">
              <Mail className="w-5 h-5" aria-hidden="true" />
              privacy@cloudact.ai
            </a>
            <p className="ca-legal-contact-address">
              <strong>CloudAct Inc.</strong><br />
              100 S Murphy Ave, STE 200 PMB4013<br />
              Sunnyvale, CA 94086<br />
              United States<br />
              Phone: (850) 988-7471
            </p>
            <div className="ca-legal-links">
              <Link href="/terms" className="ca-legal-link">Terms of Service</Link>
              <Link href="/security" className="ca-legal-link">Security</Link>
              <Link href="/compliance" className="ca-legal-link">Compliance</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Questions About Your Data?</h2>
          <p className="ca-final-cta-subtitle">
            Our team is here to help you understand how we protect your information.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/contact" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Contact Us
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </Link>
            <Link href="/security" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              View Security
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
