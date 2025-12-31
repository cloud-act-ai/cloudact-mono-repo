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
  title: "Terms of Service | CloudAct.ai",
  description: "CloudAct.ai Terms of Service. By using CloudAct.ai, you agree to these terms governing your use of our platform.",
  openGraph: {
    title: "Terms of Service | CloudAct.ai",
    description: "Terms of Service governing use of CloudAct.ai platform.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function TermsPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <FileText className="w-4 h-4" />
            Legal
          </div>
          <h1 className="ca-page-hero-title">
            Terms of <span className="ca-hero-highlight-mint">Service</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            By accessing or using CloudAct.ai, you agree to be bound by these Terms of Service
            and all applicable laws and regulations.
          </p>
          <div className="ca-legal-date">
            <Calendar className="w-4 h-4" />
            Last updated: January 2025
          </div>

          {/* Legal Navigation */}
          <div className="ca-legal-nav">
            <Link href="/privacy" className="ca-legal-nav-link">
              <Shield className="w-4 h-4" />
              Privacy
            </Link>
            <Link href="/terms" className="ca-legal-nav-link active">
              <FileText className="w-4 h-4" />
              Terms
            </Link>
            <Link href="/security" className="ca-legal-nav-link">
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
          {/* Agreement to Terms */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Agreement to Terms</h2>
            <p className="ca-legal-section-text">
              By accessing or using CloudAct.ai, you agree to be bound by these Terms of Service and all applicable
              laws and regulations. If you do not agree with any of these terms, you are prohibited from using or
              accessing this platform.
            </p>
          </div>

          {/* Use License */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Use License</h2>
            <p className="ca-legal-section-text">
              CloudAct.ai grants you a limited, non-exclusive, non-transferable license to access and use the platform
              for your internal business purposes, subject to these Terms.
            </p>
          </div>

          {/* User Responsibilities */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">User Responsibilities</h2>
            <p className="ca-legal-section-text">You are responsible for:</p>
            <ul className="ca-legal-list">
              <li>Maintaining the security of your account credentials</li>
              <li>All activities that occur under your account</li>
              <li>Ensuring your use complies with applicable laws</li>
              <li>The accuracy of information you provide</li>
              <li>The security and proper configuration of any API keys or credentials you provide</li>
            </ul>
          </div>

          {/* API Keys Alert */}
          <div className="ca-legal-alert">
            <AlertTriangle className="ca-legal-alert-icon" />
            <div className="ca-legal-alert-content">
              <h3>Important: API Keys and Credentials</h3>
              <p>
                We strongly recommend that you use <strong>read-only API keys and credentials</strong> at all times
                when connecting your cloud providers and third-party services to CloudAct.ai. Read-only access is
                sufficient for cost monitoring and analytics purposes.
              </p>
            </div>
          </div>

          {/* API Keys Section */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">API Keys and Credentials</h2>
            <p className="ca-legal-section-text">You are solely responsible for:</p>
            <ul className="ca-legal-list">
              <li>Ensuring API keys have minimal required permissions (read-only recommended)</li>
              <li>Regularly rotating and auditing credentials</li>
              <li>Revoking access immediately if you suspect any compromise</li>
              <li>Any consequences arising from using credentials with write or administrative permissions</li>
            </ul>
          </div>

          {/* Payment Terms */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Payment Terms</h2>
            <p className="ca-legal-section-text">
              Subscription fees are billed monthly or annually in advance. All fees are non-refundable except as
              required by law or as explicitly stated in these Terms.
            </p>
          </div>

          {/* Intellectual Property */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Intellectual Property</h2>
            <p className="ca-legal-section-text">
              The platform and its original content, features, and functionality are owned by CloudAct.ai and are
              protected by international copyright, trademark, patent, trade secret, and other intellectual property
              laws.
            </p>
          </div>

          {/* Limitation of Liability */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Limitation of Liability</h2>
            <p className="ca-legal-section-text">
              TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLOUDACT.AI AND ITS OFFICERS, DIRECTORS, EMPLOYEES,
              AGENTS, SUPPLIERS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
              PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE,
              DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO YOUR USE OF THE PLATFORM.
            </p>
            <p className="ca-legal-section-text">
              <strong>Data Breach Disclaimer:</strong> CloudAct.ai shall have zero liability for any data leaks,
              security breaches, unauthorized access, or data loss arising from:
            </p>
            <ul className="ca-legal-list">
              <li>Your failure to use read-only credentials as recommended</li>
              <li>Credentials with excessive permissions beyond what is necessary</li>
              <li>Third-party services, cloud providers, or integrations</li>
              <li>Your failure to implement adequate security measures on your end</li>
              <li>Cyberattacks, hacking, or unauthorized access to your accounts</li>
              <li>Any actions taken by malicious actors using compromised credentials</li>
            </ul>
            <p className="ca-legal-section-text">
              IN NO EVENT SHALL CLOUDACT.AI'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO
              THESE TERMS OR YOUR USE OF THE PLATFORM EXCEED THE AMOUNT PAID BY YOU TO CLOUDACT.AI DURING THE
              TWELVE (12) MONTHS PRECEDING THE CLAIM.
            </p>
          </div>

          {/* Disclaimer of Warranties */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Disclaimer of Warranties</h2>
            <p className="ca-legal-section-text">
              THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
              IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
              PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE OF TRADE.
            </p>
            <p className="ca-legal-section-text">
              CloudAct.ai does not warrant that the platform will be uninterrupted, error-free, secure, or free of
              viruses or other harmful components. You acknowledge that you use the platform at your own risk.
            </p>
          </div>

          {/* Indemnification */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Indemnification</h2>
            <p className="ca-legal-section-text">
              You agree to indemnify, defend, and hold harmless CloudAct.ai and its officers, directors, employees,
              agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and
              expenses (including reasonable attorneys' fees) arising out of or relating to:
            </p>
            <ul className="ca-legal-list">
              <li>Your use of the platform</li>
              <li>Your violation of these Terms</li>
              <li>Your provision of API keys or credentials with excessive permissions</li>
              <li>Any data breach or security incident resulting from your actions or omissions</li>
            </ul>
          </div>

          {/* Termination */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Termination</h2>
            <p className="ca-legal-section-text">
              We may terminate or suspend your account at any time for violations of these Terms or for any other
              reason at our sole discretion. Upon termination, your right to use the platform will immediately cease.
            </p>
          </div>

          {/* Governing Law */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Governing Law and Jurisdiction</h2>
            <p className="ca-legal-section-text">
              These Terms shall be governed by and construed in accordance with the laws of the State of California,
              United States, without regard to its conflict of law provisions. You agree to submit to the exclusive
              jurisdiction of the state and federal courts located in Santa Clara County, California for the resolution
              of any disputes arising out of or relating to these Terms or your use of the platform.
            </p>
          </div>

          {/* Compliance */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Compliance</h2>
            <p className="ca-legal-section-text">
              CloudAct.ai maintains the following compliance standards:
            </p>
            <ul className="ca-legal-list">
              <li><strong>SOC 2 Type II:</strong> Annual third-party security audits</li>
              <li><strong>GDPR:</strong> Compliance with European data protection regulations</li>
              <li><strong>CCPA:</strong> Compliance with California Consumer Privacy Act</li>
            </ul>
            <p className="ca-legal-section-text">
              However, compliance certifications do not guarantee absolute security, and you acknowledge that no
              system is completely immune to security threats.
            </p>
          </div>

          {/* Severability */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Severability</h2>
            <p className="ca-legal-section-text">
              If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining
              provisions shall continue in full force and effect. The invalid provision shall be modified to the
              minimum extent necessary to make it valid and enforceable.
            </p>
          </div>

          {/* Entire Agreement */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Entire Agreement</h2>
            <p className="ca-legal-section-text">
              These Terms, together with our Privacy Policy and any other legal notices published on the platform,
              constitute the entire agreement between you and CloudAct.ai regarding your use of the platform and
              supersede all prior agreements and understandings.
            </p>
          </div>

          {/* Changes to Terms */}
          <div className="ca-legal-section">
            <h2 className="ca-legal-section-title">Changes to Terms</h2>
            <p className="ca-legal-section-text">
              We reserve the right to modify these Terms at any time. We will notify you of material changes by
              posting the updated Terms on this page with a new "Last updated" date. Your continued use of the
              platform after any changes constitutes your acceptance of the modified Terms.
            </p>
          </div>

          {/* Contact */}
          <div className="ca-legal-contact">
            <h3 className="ca-legal-contact-title">Contact Us</h3>
            <p className="ca-legal-section-text" style={{ marginBottom: "1rem" }}>
              Questions about the Terms of Service should be sent to:
            </p>
            <a href="mailto:legal@cloudact.ai" className="ca-legal-contact-email">
              <Mail className="w-5 h-5" />
              legal@cloudact.ai
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
              <Link href="/security" className="ca-legal-link">Security</Link>
              <Link href="/compliance" className="ca-legal-link">Compliance</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Questions About Our Terms?</h2>
          <p className="ca-final-cta-subtitle">
            Our team is here to help clarify any questions about our service agreement.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/contact" className="ca-btn-cta-primary">
              Contact Us
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/privacy" className="ca-btn-cta-secondary">
              View Privacy Policy
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
