import type { Metadata } from "next"

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
    <>
      {/* Hero Section */}
      <section className="py-16 sm:py-20 md:py-24 lg:py-32 border-b">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center space-y-4 sm:space-y-6">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">Privacy Policy</h1>
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
                <h2 className="text-2xl font-bold">Introduction</h2>
                <p className="text-muted-foreground leading-relaxed">
                  CloudAct.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains
                  how we collect, use, disclose, and safeguard your information when you use our platform.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Information We Collect</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We collect information that you provide directly to us, including:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Account information (name, email, company)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Cloud provider credentials (securely encrypted)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Usage data and cost information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Payment information (processed by Stripe)</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">API Keys and Credentials</h2>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <p className="text-amber-800 dark:text-amber-200 font-semibold mb-2">
                    ⚠️ Important Security Recommendation
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 text-sm leading-relaxed">
                    We strongly recommend using <strong>READ-ONLY API keys and credentials</strong> at all times when
                    connecting your cloud providers and third-party services to CloudAct.ai. Read-only access provides
                    full cost monitoring and analytics capabilities while minimizing security risk.
                  </p>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  When you provide API keys or credentials:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>They are encrypted using industry-standard AES-256 encryption at rest</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>They are transmitted only over TLS 1.3 encrypted connections</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>You are solely responsible for the permission scope of credentials you provide</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>You should use the minimum permissions necessary (read-only recommended)</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">How We Use Your Information</h2>
                <p className="text-muted-foreground leading-relaxed">We use the information we collect to:</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Provide, maintain, and improve our services</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Process transactions and send related information</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Send technical notices and support messages</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Monitor and analyze trends and usage</span>
                  </li>
                </ul>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Data Security</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We implement industry-standard security measures to protect your data, including encryption at rest and
                  in transit, regular security audits, and SOC 2 Type II compliance.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Data Breach Disclaimer</h2>
                <p className="text-muted-foreground leading-relaxed">
                  While we implement robust security measures, no method of transmission over the Internet or electronic
                  storage is 100% secure. CloudAct.ai assumes <strong className="text-foreground">zero liability</strong> for
                  any data leaks, security breaches, or unauthorized access arising from:
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your use of credentials with write or administrative permissions instead of read-only access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Third-party cloud providers, services, or integrations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Cyberattacks, hacking, or malicious activities beyond our reasonable control</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Your failure to maintain adequate security practices for your own systems</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground mt-1">•</span>
                    <span>Compromise of credentials on your end before transmission to our platform</span>
                  </li>
                </ul>
                <p className="text-muted-foreground leading-relaxed">
                  You acknowledge and agree that you provide credentials and data at your own risk, and we strongly
                  encourage the use of read-only credentials to minimize potential exposure in any security event.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Data Retention</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We retain your personal information for as long as necessary to fulfill the purposes outlined in this
                  Privacy Policy, unless a longer retention period is required or permitted by law.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Your Rights</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Depending on your location, you may have certain rights regarding your personal information, including
                  the right to access, correct, delete, or port your data. Contact us to exercise these rights.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Third-Party Services</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our platform integrates with third-party cloud providers (AWS, Azure, GCP), GenAI providers (OpenAI,
                  Anthropic, Google), and other services. We are not responsible for the privacy practices of these
                  third parties. Your use of third-party services is subject to their respective privacy policies.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">International Data Transfers</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Your information may be transferred to and processed in countries other than your country of residence.
                  These countries may have different data protection laws. By using the platform, you consent to such
                  transfers. We implement appropriate safeguards for international data transfers in compliance with
                  applicable laws.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Children's Privacy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  Our platform is not intended for individuals under the age of 18. We do not knowingly collect personal
                  information from children. If we become aware that we have collected personal information from a child
                  without parental consent, we will take steps to delete that information.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Changes to This Policy</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may update this Privacy Policy from time to time. We will notify you of any material changes by
                  posting the new Privacy Policy on this page with an updated "Last updated" date. Your continued use
                  of the platform after any changes constitutes your acceptance of the modified policy.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Contact Us</h2>
                <p className="text-muted-foreground leading-relaxed">
                  If you have questions about this Privacy Policy, please contact us at{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "privacy@cloudact.ai"}`}
                    className="text-foreground font-medium hover:underline"
                  >
                    {process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "privacy@cloudact.ai"}
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
