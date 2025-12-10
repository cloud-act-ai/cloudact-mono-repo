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
      <section className="py-24 md:py-32 border-b">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl text-center space-y-6">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Terms of Service</h1>
            <p className="text-lg text-muted-foreground">Last updated: January 2025</p>
          </div>
        </div>
      </section>

      {/* Content Section */}
      <section className="py-16 md:py-24">
        <div className="container px-4">
          <div className="mx-auto max-w-3xl">
            <div className="prose dark:prose-invert max-w-none space-y-8">
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
                  In no event shall CloudAct.ai be liable for any indirect, incidental, special, consequential, or
                  punitive damages arising out of or relating to your use of the platform.
                </p>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold">Termination</h2>
                <p className="text-muted-foreground leading-relaxed">
                  We may terminate or suspend your account at any time for violations of these Terms or for any other
                  reason at our sole discretion. Upon termination, your right to use the platform will immediately cease.
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
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
