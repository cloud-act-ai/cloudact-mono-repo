import type { Metadata } from "next"
import { Shield, FileCheck, Globe, Lock, CheckCircle2, AlertTriangle } from "lucide-react"
import Link from "next/link"

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

export default function CompliancePage() {
  return (
    <>
      {/* Hero Section */}
      <section className="py-16 sm:py-20 md:py-24 lg:py-32 border-b">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#90FCA6]/10 rounded-full mb-4">
              <FileCheck className="w-4 h-4 text-[#1a7a3a]" />
              <span className="text-sm font-medium text-[#1a7a3a]">Compliance Standards</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">Compliance at CloudAct</h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              We maintain rigorous compliance standards to ensure your data is handled with the highest level of care and regulatory adherence.
            </p>
          </div>
        </div>
      </section>

      {/* Compliance Certifications */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-4xl">
            <h2 className="text-2xl font-bold text-center mb-12">Our Compliance Certifications</h2>

            <div className="grid md:grid-cols-3 gap-8 mb-16">
              {/* SOC 2 */}
              <div className="text-center p-8 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-16 h-16 rounded-full bg-[#90FCA6]/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-2">SOC 2 Type II</h3>
                <p className="text-muted-foreground text-sm">
                  Annual third-party audits verify our security controls meet AICPA standards.
                </p>
              </div>

              {/* GDPR */}
              <div className="text-center p-8 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-16 h-16 rounded-full bg-[#90FCA6]/10 flex items-center justify-center mx-auto mb-4">
                  <Globe className="w-8 h-8 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-2">GDPR</h3>
                <p className="text-muted-foreground text-sm">
                  Compliant with European Union General Data Protection Regulation requirements.
                </p>
              </div>

              {/* CCPA */}
              <div className="text-center p-8 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-16 h-16 rounded-full bg-[#90FCA6]/10 flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-8 h-8 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-2">CCPA</h3>
                <p className="text-muted-foreground text-sm">
                  Compliant with California Consumer Privacy Act data protection standards.
                </p>
              </div>
            </div>

            {/* Important Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 mb-12">
              <div className="flex items-start gap-4">
                <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-amber-800 mb-2">Important Disclaimer</h3>
                  <p className="text-amber-700 text-sm leading-relaxed mb-3">
                    While CloudAct.ai maintains these compliance certifications, they do not guarantee absolute security
                    or immunity from data breaches. No system is 100% secure. We strongly recommend:
                  </p>
                  <ul className="space-y-1 text-amber-700 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span>Always use <strong>READ-ONLY API keys</strong> when connecting cloud providers</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span>Regularly rotate and audit your credentials</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <span>Implement your own security best practices</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Detailed Compliance Info */}
            <div className="prose dark:prose-invert max-w-none space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Data Protection Measures</h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Encryption:</strong> AES-256 at rest, TLS 1.3 in transit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Data Residency:</strong> Data stored in Google Cloud Platform (US regions)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Access Controls:</strong> Role-based access, MFA, audit logging</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Data Retention:</strong> Configurable retention policies per organization</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Your Data Rights</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Under GDPR and CCPA, you have the following rights:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Right to Access:</strong> Request a copy of your personal data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Right to Rectification:</strong> Correct inaccurate personal data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Right to Erasure:</strong> Request deletion of your personal data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Right to Portability:</strong> Export your data in a machine-readable format</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Right to Opt-Out:</strong> Opt out of data sales (we do not sell data)</span>
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed">
                  To exercise these rights, contact us at{" "}
                  <a href="mailto:privacy@cloudact.ai" className="text-foreground font-medium hover:underline">
                    privacy@cloudact.ai
                  </a>
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Third-Party Sub-processors</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We use the following sub-processors to deliver our services:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Google Cloud Platform:</strong> Infrastructure and data storage (US)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Stripe:</strong> Payment processing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Supabase:</strong> Authentication services</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Limitation of Liability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Compliance certifications and security measures do not constitute a guarantee against data breaches.
                  CloudAct.ai assumes <strong className="text-foreground">zero liability</strong> for security incidents
                  arising from factors outside our direct control, including but not limited to:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Credentials provided with excessive permissions (non-read-only)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Security incidents at third-party cloud providers</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>User failure to follow security best practices</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Nation-state attacks or advanced persistent threats</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4 pt-8 border-t">
                <h2 className="text-2xl font-bold">Contact Us</h2>
                <p className="text-muted-foreground leading-relaxed">
                  For compliance inquiries, contact us at{" "}
                  <a href="mailto:compliance@cloudact.ai" className="text-foreground font-medium hover:underline">
                    compliance@cloudact.ai
                  </a>
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  <strong className="text-foreground">CloudAct Inc.</strong><br />
                  100 S Murphy Ave, STE 200 PMB4013<br />
                  Sunnyvale, CA 94086<br />
                  United States<br />
                  Phone: (850) 988-7471
                </p>
                <p className="text-sm text-muted-foreground mt-4">
                  See also: <Link href="/privacy" className="text-foreground hover:underline">Privacy Policy</Link> |{" "}
                  <Link href="/terms" className="text-foreground hover:underline">Terms of Service</Link> |{" "}
                  <Link href="/security" className="text-foreground hover:underline">Security</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
