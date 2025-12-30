import type { Metadata } from "next"

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
    <>
      {/* Hero Section */}
      <section className="py-16 sm:py-20 md:py-24 lg:py-32 border-b">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-base sm:text-lg text-muted-foreground">Last updated: January 2025</p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-12 sm:py-16 md:py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl">
            <div className="prose dark:prose-invert max-w-none space-y-6 sm:space-y-8">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Agreement to Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  By accessing or using CloudAct.ai, you agree to be bound by these Terms of Service and all applicable
                  laws and regulations. If you do not agree with any of these terms, you are prohibited from using or
                  accessing this platform.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Use License</h2>
                <p className="text-muted-foreground leading-relaxed">
                  CloudAct.ai grants you a limited, non-exclusive, non-transferable license to access and use the platform
                  for your internal business purposes, subject to these Terms.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">User Responsibilities</h2>
                <p className="text-muted-foreground leading-relaxed">You are responsible for:</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Maintaining the security of your account credentials</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>All activities that occur under your account</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Ensuring your use complies with applicable laws</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>The accuracy of information you provide</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>The security and proper configuration of any API keys or credentials you provide</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">API Keys and Credentials</h2>
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Important Security Recommendation:</strong> We strongly recommend that you
                  use <strong className="text-foreground">read-only API keys and credentials</strong> at all times when connecting
                  your cloud providers and third-party services to CloudAct.ai. Read-only access is sufficient for cost monitoring
                  and analytics purposes.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  You are solely responsible for:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Ensuring API keys have minimal required permissions (read-only recommended)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Regularly rotating and auditing credentials</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Revoking access immediately if you suspect any compromise</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Any consequences arising from using credentials with write or administrative permissions</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Payment Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Subscription fees are billed monthly or annually in advance. All fees are non-refundable except as
                  required by law or as explicitly stated in these Terms.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Intellectual Property</h2>
                <p className="text-muted-foreground leading-relaxed">
                  The platform and its original content, features, and functionality are owned by CloudAct.ai and are
                  protected by international copyright, trademark, patent, trade secret, and other intellectual property
                  laws.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Limitation of Liability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, CLOUDACT.AI AND ITS OFFICERS, DIRECTORS, EMPLOYEES,
                  AGENTS, SUPPLIERS, AND LICENSORS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                  PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, USE,
                  DATA, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATING TO YOUR USE OF THE PLATFORM.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Data Breach Disclaimer:</strong> CloudAct.ai shall have zero liability
                  for any data leaks, security breaches, unauthorized access, or data loss arising from:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your failure to use read-only credentials as recommended</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Credentials with excessive permissions beyond what is necessary</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Third-party services, cloud providers, or integrations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your failure to implement adequate security measures on your end</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Cyberattacks, hacking, or unauthorized access to your accounts</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Any actions taken by malicious actors using compromised credentials</span>
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed">
                  IN NO EVENT SHALL CLOUDACT.AI'S TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING OUT OF OR RELATING TO
                  THESE TERMS OR YOUR USE OF THE PLATFORM EXCEED THE AMOUNT PAID BY YOU TO CLOUDACT.AI DURING THE
                  TWELVE (12) MONTHS PRECEDING THE CLAIM.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Disclaimer of Warranties</h2>
                <p className="text-muted-foreground leading-relaxed">
                  THE PLATFORM IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR
                  IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                  PURPOSE, NON-INFRINGEMENT, AND ANY WARRANTIES ARISING OUT OF COURSE OF DEALING OR USAGE OF TRADE.
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  CloudAct.ai does not warrant that the platform will be uninterrupted, error-free, secure, or free of
                  viruses or other harmful components. You acknowledge that you use the platform at your own risk.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Indemnification</h2>
                <p className="text-muted-foreground leading-relaxed">
                  You agree to indemnify, defend, and hold harmless CloudAct.ai and its officers, directors, employees,
                  agents, and affiliates from and against any and all claims, damages, losses, liabilities, costs, and
                  expenses (including reasonable attorneys' fees) arising out of or relating to:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your use of the platform</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your violation of these Terms</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your provision of API keys or credentials with excessive permissions</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Any data breach or security incident resulting from your actions or omissions</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Termination</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may terminate or suspend your account at any time for violations of these Terms or for any other
                  reason at our sole discretion. Upon termination, your right to use the platform will immediately cease.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Governing Law and Jurisdiction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These Terms shall be governed by and construed in accordance with the laws of the State of California,
                  United States, without regard to its conflict of law provisions. You agree to submit to the exclusive
                  jurisdiction of the state and federal courts located in Santa Clara County, California for the resolution
                  of any disputes arising out of or relating to these Terms or your use of the platform.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Compliance</h2>
                <p className="text-muted-foreground leading-relaxed">
                  CloudAct.ai maintains the following compliance standards:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">SOC 2 Type II:</strong> Annual third-party security audits</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">GDPR:</strong> Compliance with European data protection regulations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span><strong className="text-foreground">CCPA:</strong> Compliance with California Consumer Privacy Act</span>
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed">
                  However, compliance certifications do not guarantee absolute security, and you acknowledge that no
                  system is completely immune to security threats.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Severability</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If any provision of these Terms is held to be invalid, illegal, or unenforceable, the remaining
                  provisions shall continue in full force and effect. The invalid provision shall be modified to the
                  minimum extent necessary to make it valid and enforceable.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Entire Agreement</h2>
                <p className="text-muted-foreground leading-relaxed">
                  These Terms, together with our Privacy Policy and any other legal notices published on the platform,
                  constitute the entire agreement between you and CloudAct.ai regarding your use of the platform and
                  supersede all prior agreements and understandings.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Changes to Terms</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We reserve the right to modify these Terms at any time. We will notify you of material changes by
                  posting the updated Terms on this page with a new "Last updated" date. Your continued use of the
                  platform after any changes constitutes your acceptance of the modified Terms.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Contact Us</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Questions about the Terms of Service should be sent to{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_LEGAL_EMAIL || "legal@cloudact.ai"}`}
                    className="text-foreground font-medium hover:underline"
                  >
                    {process.env.NEXT_PUBLIC_LEGAL_EMAIL || "legal@cloudact.ai"}
                  </a>
                </p>
                <p className="text-muted-foreground leading-relaxed mt-4">
                  <strong className="text-foreground">CloudAct Inc.</strong><br />
                  100 S Murphy Ave, STE 200 PMB4013<br />
                  Sunnyvale, CA 94086<br />
                  United States<br />
                  Phone: (850) 988-7471
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
