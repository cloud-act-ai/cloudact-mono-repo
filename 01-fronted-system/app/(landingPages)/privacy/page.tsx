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
            <p className="text-base sm:text-lg text-[#8E8E93]">Last updated: January 2025</p>
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
                <p className="text-[#8E8E93] leading-relaxed">
                  CloudAct.ai ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains
                  how we collect, use, disclose, and safeguard your information when you use our platform.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Information We Collect</h2>
                <p className="text-[#8E8E93] leading-relaxed">
                  We collect information that you provide directly to us, including:
                </p>
                <ul className="space-y-2 text-[#8E8E93]">
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
                <h2 className="text-2xl font-bold">How We Use Your Information</h2>
                <p className="text-[#8E8E93] leading-relaxed">We use the information we collect to:</p>
                <ul className="space-y-2 text-[#8E8E93]">
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
                <p className="text-[#8E8E93] leading-relaxed">
                  We implement industry-standard security measures to protect your data, including encryption at rest and
                  in transit, regular security audits, and SOC 2 Type II compliance.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Data Retention</h2>
                <p className="text-[#8E8E93] leading-relaxed">
                  We retain your personal information for as long as necessary to fulfill the purposes outlined in this
                  Privacy Policy, unless a longer retention period is required or permitted by law.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Your Rights</h2>
                <p className="text-[#8E8E93] leading-relaxed">
                  Depending on your location, you may have certain rights regarding your personal information, including
                  the right to access, correct, delete, or port your data. Contact us to exercise these rights.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Contact Us</h2>
                <p className="text-[#8E8E93] leading-relaxed">
                  If you have questions about this Privacy Policy, please contact us at{" "}
                  <a
                    href={`mailto:${process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "privacy@cloudact.ai"}`}
                    className="text-foreground font-medium hover:underline"
                  >
                    {process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "privacy@cloudact.ai"}
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
