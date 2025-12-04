import type { Metadata } from "next"
import { Cloud, Heart, Shield, Target, Users, Sparkles } from "lucide-react"

export const metadata: Metadata = {
  title: "About Us - Democratizing Cost Intelligence | CloudAct.ai",
  description: "Founded in 2024 by cloud infrastructure and AI engineers. CloudAct.ai helps 500+ companies optimize $50M+ in GenAI and cloud costs with 67% average reduction.",
  openGraph: {
    title: "About Us - Democratizing Cost Intelligence | CloudAct.ai",
    description: "Founded in 2024, CloudAct.ai helps 500+ companies optimize $50M+ in GenAI and cloud costs.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "About Us - Democratizing Cost Intelligence | CloudAct.ai",
    description: "Making GenAI and cloud infrastructure affordable for every organization.",
  },
}

export default function AboutPage() {
  return (
    <>
      {/* Hero Section */}
      <section className="relative py-16 md:py-20 overflow-hidden bg-white">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-3xl text-center space-y-4">
            <div className="cloudact-badge-coral">
              <span className="flex h-2 w-2 rounded-full bg-cloudact-coral animate-pulse" />
              Our Mission
            </div>
            <h1 className="cloudact-heading-xl">
              Democratizing Cost Intelligence
            </h1>
            <p className="cloudact-body text-lg max-w-2xl mx-auto">
              Making GenAI and cloud infrastructure affordable and accessible for every organization
            </p>
          </div>
        </div>
      </section>

      {/* Story Section */}
      <section className="py-16 md:py-24 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-4xl space-y-12">
            <div className="space-y-8 cloudact-body text-lg leading-relaxed">
              <p>
                <span className="text-5xl font-bold text-cloudact-teal float-left mr-3 leading-none">C</span>
                loudAct.ai was founded in 2024 by a team of cloud infrastructure and AI engineers who experienced the
                pain of unpredictable GenAI costs firsthand. After watching companies burn through budgets with little
                visibility into their AI spending, we knew there had to be a better way.
              </p>
              <p>
                We built the platform we wished existed: intelligent cost monitoring that works in real-time, automated
                recommendations that actually save money, and a unified view of GenAI and cloud costs that makes sense.
              </p>
              <p>
                Today, CloudAct helps hundreds of companies optimize millions in GenAI and cloud spending. Our
                AI-powered platform provides the visibility, insights, and automation needed to reduce costs by an
                average of 67%—without compromising on performance or innovation.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Grid */}
      <section className="cloudact-stats-section py-20 relative overflow-hidden">
        <div className="container px-4 md:px-12 relative z-10">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4">
              <div className="text-center space-y-4">
                <Users className="h-10 w-10 mx-auto text-white/80" />
                <div className="cloudact-stat-value">500+</div>
                <div className="text-lg text-white/80 font-medium">Companies Trust Us</div>
              </div>
              <div className="text-center space-y-4">
                <Cloud className="h-10 w-10 mx-auto text-white/80" />
                <div className="cloudact-stat-value">$50M+</div>
                <div className="text-lg text-white/80 font-medium">Costs Optimized</div>
              </div>
              <div className="text-center space-y-4">
                <Shield className="h-10 w-10 mx-auto text-white/80" />
                <div className="cloudact-stat-value">67%</div>
                <div className="text-lg text-white/80 font-medium">Avg. Cost Reduction</div>
              </div>
              <div className="text-center space-y-4">
                <Heart className="h-10 w-10 mx-auto text-white/80" />
                <div className="cloudact-stat-value">98%</div>
                <div className="text-lg text-white/80 font-medium">Customer Satisfaction</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Values Section */}
      <section className="py-20 bg-white">
        <div className="container px-4 md:px-12">
          <div className="mx-auto max-w-6xl">
            <div className="text-center space-y-4 mb-16">
              <h2 className="cloudact-heading-lg">Our Values</h2>
              <p className="cloudact-body text-lg">What drives us every day</p>
            </div>

            <div className="grid gap-8 md:grid-cols-2">
              <div className="cloudact-card group p-8">
                <div className="space-y-6">
                  <div className="cloudact-icon-box-coral">
                    <Target className="h-8 w-8" />
                  </div>
                  <h3 className="cloudact-heading-md">Customer Obsessed</h3>
                  <p className="cloudact-body leading-relaxed">
                    We measure our success by the money we save our customers. Every feature, every optimization, every
                    improvement is designed with your bottom line in mind.
                  </p>
                </div>
              </div>

              <div className="cloudact-card group p-8">
                <div className="space-y-6">
                  <div className="cloudact-icon-box">
                    <Shield className="h-8 w-8" />
                  </div>
                  <h3 className="cloudact-heading-md">Trust & Transparency</h3>
                  <p className="cloudact-body leading-relaxed">
                    Your data is your most valuable asset. We're SOC 2 Type II certified and committed to the highest
                    standards of security, privacy, and transparency.
                  </p>
                </div>
              </div>

              <div className="cloudact-card group p-8">
                <div className="space-y-6">
                  <div className="cloudact-icon-box-coral">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <h3 className="cloudact-heading-md">Innovation First</h3>
                  <p className="cloudact-body leading-relaxed">
                    The cloud and AI landscape changes daily. We stay ahead of the curve, continuously innovating to help
                    you optimize costs in new and better ways.
                  </p>
                </div>
              </div>

              <div className="cloudact-card group p-8">
                <div className="space-y-6">
                  <div className="cloudact-icon-box">
                    <Users className="h-8 w-8" />
                  </div>
                  <h3 className="cloudact-heading-md">Built for Teams</h3>
                  <p className="cloudact-body leading-relaxed">
                    Cost optimization is a team sport. We build tools that bring engineering, finance, and leadership
                    together around a shared goal: efficiency.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
