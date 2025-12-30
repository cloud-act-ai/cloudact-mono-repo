import type { Metadata } from "next"
import { Shield, Lock, Key, Eye, Server, FileCheck, AlertTriangle, CheckCircle2 } from "lucide-react"
import Link from "next/link"

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

export default function SecurityPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="py-16 sm:py-20 md:py-24 lg:py-32 border-b">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center space-y-4 sm:space-y-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-[#90FCA6]/10 rounded-full mb-4">
              <Shield className="w-4 h-4 text-[#1a7a3a]" />
              <span className="text-sm font-medium text-[#1a7a3a]">Enterprise Security</span>
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">Security at CloudAct</h1>
            <p className="text-base sm:text-lg text-muted-foreground">
              Your data security is our top priority. We implement industry-leading security measures to protect your cloud cost information.
            </p>
          </div>
        </div>
      </section>

      {/* Important Notice */}
      <section className="py-8 bg-amber-50 border-b border-amber-200">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
              <div>
                <h3 className="font-semibold text-amber-800 mb-2">Important Security Recommendation</h3>
                <p className="text-amber-700 text-sm leading-relaxed">
                  We strongly recommend using <strong>READ-ONLY API keys and credentials</strong> at all times when connecting
                  your cloud providers to CloudAct.ai. Read-only access is sufficient for cost monitoring and analytics,
                  and minimizes security risk in the unlikely event of any security incident.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-4xl">
            <div className="grid md:grid-cols-2 gap-8 mb-16">
              {/* Encryption */}
              <div className="p-6 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center mb-4">
                  <Lock className="w-6 h-6 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Encryption</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>AES-256 encryption at rest</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>TLS 1.3 encryption in transit</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Encrypted credential storage</span>
                  </li>
                </ul>
              </div>

              {/* Access Control */}
              <div className="p-6 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center mb-4">
                  <Key className="w-6 h-6 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Access Control</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Role-based access control (RBAC)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Multi-factor authentication (MFA)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>SSO integration support</span>
                  </li>
                </ul>
              </div>

              {/* Infrastructure */}
              <div className="p-6 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center mb-4">
                  <Server className="w-6 h-6 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Infrastructure</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Google Cloud Platform hosting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Isolated tenant environments</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Regular security audits</span>
                  </li>
                </ul>
              </div>

              {/* Monitoring */}
              <div className="p-6 rounded-2xl border border-gray-200 hover:border-[#90FCA6] transition-colors">
                <div className="w-12 h-12 rounded-xl bg-[#90FCA6]/10 flex items-center justify-center mb-4">
                  <Eye className="w-6 h-6 text-[#1a7a3a]" />
                </div>
                <h3 className="text-xl font-semibold mb-3">Monitoring</h3>
                <ul className="space-y-2 text-muted-foreground text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>24/7 security monitoring</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Intrusion detection systems</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#1a7a3a] mt-0.5 flex-shrink-0" />
                    <span>Automated threat response</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Your Responsibility */}
            <div className="prose dark:prose-invert max-w-none space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Your Security Responsibilities</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Security is a shared responsibility. While we implement robust security measures, you are responsible for:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Using read-only credentials</strong> — We strongly recommend read-only API keys for all integrations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Credential management</strong> — Regularly rotating and securely storing your credentials</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Access management</strong> — Properly managing who has access to your CloudAct account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">Reporting incidents</strong> — Promptly reporting any suspected security issues</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Liability Disclaimer</h2>
                <p className="text-muted-foreground leading-relaxed">
                  CloudAct.ai assumes <strong className="text-foreground">zero liability</strong> for any data breaches,
                  security incidents, or unauthorized access arising from:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Use of credentials with write or administrative permissions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Third-party cloud providers or integration services</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your failure to implement recommended security practices</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Cyberattacks or malicious activities beyond our control</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Report a Vulnerability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you discover a security vulnerability, please report it responsibly to{" "}
                  <a href="mailto:security@cloudact.ai" className="text-foreground font-medium hover:underline">
                    security@cloudact.ai
                  </a>
                </p>
              </div>

              <div className="space-y-4 pt-8 border-t">
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">CloudAct Inc.</strong><br />
                  100 S Murphy Ave, STE 200 PMB4013<br />
                  Sunnyvale, CA 94086<br />
                  United States
                </p>
                <p className="text-sm text-muted-foreground">
                  For more information, see our{" "}
                  <Link href="/privacy" className="text-foreground hover:underline">Privacy Policy</Link> and{" "}
                  <Link href="/terms" className="text-foreground hover:underline">Terms of Service</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
