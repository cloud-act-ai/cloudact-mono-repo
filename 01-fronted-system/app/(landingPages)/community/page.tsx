import type { Metadata } from "next"
import Link from "next/link"
import {
  Users,
  MessageSquare,
  Github,
  Twitter,
  Linkedin,
  ArrowRight,
  Sparkles,
  Calendar,
  BookOpen,
  Award,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: "Community | CloudAct.ai",
  description: "Join the CloudAct.ai community. Connect with cloud cost optimization experts, share best practices, and get help.",
  openGraph: {
    title: "Community | CloudAct.ai",
    description: "Join our community of cloud cost optimization experts.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const COMMUNITY_CHANNELS = [
  {
    icon: MessageSquare,
    title: "Discord Community",
    description: "Join our Discord server to chat with other users and get real-time support",
    members: "1,200+",
    cta: "Join Discord",
    href: "https://discord.gg/cloudact",
    color: "purple",
  },
  {
    icon: Github,
    title: "GitHub Discussions",
    description: "Participate in technical discussions, feature requests, and bug reports",
    members: "500+",
    cta: "View Discussions",
    href: "https://github.com/cloudact-ai/discussions",
    color: "mint",
  },
  {
    icon: Twitter,
    title: "Twitter/X",
    description: "Follow us for the latest updates, tips, and cloud cost insights",
    members: "3,500+",
    cta: "Follow Us",
    href: "https://twitter.com/cloudactai",
    color: "blue",
  },
  {
    icon: Linkedin,
    title: "LinkedIn",
    description: "Connect with us for professional updates and industry insights",
    members: "2,800+",
    cta: "Connect",
    href: "https://linkedin.com/company/cloudact-ai",
    color: "blue",
  },
]

const COMMUNITY_BENEFITS = [
  {
    icon: Users,
    title: "Connect with Experts",
    description: "Learn from cloud cost optimization professionals and share your experiences",
  },
  {
    icon: Calendar,
    title: "Exclusive Events",
    description: "Get access to webinars, workshops, and community meetups",
  },
  {
    icon: BookOpen,
    title: "Learning Resources",
    description: "Access tutorials, guides, and best practices shared by the community",
  },
  {
    icon: Award,
    title: "Recognition",
    description: "Earn badges and recognition for your contributions to the community",
  },
]

export default function CommunityPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow">
            <Users className="w-4 h-4" aria-hidden="true" />
            Community
          </div>
          <h1 className="ca-page-hero-title">
            Join Our{" "}
            <span className="ca-hero-highlight-mint">Community</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Connect with cloud cost optimization experts, share best practices, and get help from the CloudAct.ai community.
          </p>
          <div className="ca-hero-buttons">
            <a href="https://discord.gg/cloudact" target="_blank" rel="noopener noreferrer" className="ca-btn-hero-primary">
              Join Discord
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </a>
            <Link href="/resources" className="ca-btn-hero-secondary">
              Browse Resources
            </Link>
          </div>
        </div>
      </section>

      {/* Community Channels */}
      <section className="ca-community-channels-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <MessageSquare className="w-4 h-4" aria-hidden="true" />
            Connect With Us
          </span>
          <h2 className="ca-section-title">Community Channels</h2>
          <p className="ca-section-subtitle">
            Choose your preferred way to engage with the CloudAct.ai community
          </p>
        </div>

        <div className="ca-community-channels-grid">
          {COMMUNITY_CHANNELS.map((channel) => {
            const Icon = channel.icon
            return (
              <a
                key={channel.title}
                href={channel.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`ca-community-channel-card ca-community-channel-${channel.color}`}
              >
                <div className={`ca-community-channel-icon ca-community-channel-icon-${channel.color}`}>
                  <Icon className="w-7 h-7" aria-hidden="true" />
                </div>
                <h3 className="ca-community-channel-title">{channel.title}</h3>
                <p className="ca-community-channel-desc">{channel.description}</p>
                <div className="ca-community-channel-meta">
                  <span className="ca-community-channel-members">{channel.members} members</span>
                </div>
                <span className="ca-community-channel-cta">
                  {channel.cta}
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </span>
              </a>
            )
          })}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="ca-community-benefits-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow">
            <Award className="w-4 h-4" aria-hidden="true" />
            Why Join
          </span>
          <h2 className="ca-section-title">Community Benefits</h2>
        </div>

        <div className="ca-community-benefits-grid">
          {COMMUNITY_BENEFITS.map((benefit) => {
            const Icon = benefit.icon
            return (
              <div key={benefit.title} className="ca-community-benefit-card">
                <div className="ca-community-benefit-icon">
                  <Icon className="w-6 h-6" aria-hidden="true" />
                </div>
                <h3 className="ca-community-benefit-title">{benefit.title}</h3>
                <p className="ca-community-benefit-desc">{benefit.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge">
            <Sparkles className="w-4 h-4" aria-hidden="true" />
            Ready to Connect?
          </div>
          <h2 className="ca-final-cta-title">Join the CloudAct.ai Community Today</h2>
          <p className="ca-final-cta-subtitle">
            Get started by joining our Discord server or following us on social media.
          </p>
          <div className="ca-final-cta-buttons">
            <a href="https://discord.gg/cloudact" target="_blank" rel="noopener noreferrer" className="ca-btn-cta-primary">
              Join Discord
              <ArrowRight className="w-5 h-5" aria-hidden="true" />
            </a>
            <Link href="/contact" className="ca-btn-cta-secondary">
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
