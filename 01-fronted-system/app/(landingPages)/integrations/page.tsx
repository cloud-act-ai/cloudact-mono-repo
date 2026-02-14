import type { Metadata } from "next"
import Link from "next/link"
import { siteTitle } from "@/lib/site"
import {
  ArrowRight,
  Cloud,
  Cpu,
  CreditCard,
  Check,
  Sparkles,
  Zap,
  Clock,
  Shield,
  RefreshCw,
  Plug,
  Settings,
} from "lucide-react"
import "../premium.css"

export const metadata: Metadata = {
  title: siteTitle("Integrations"),
  description: "Connect CloudAct.ai with your cloud providers, GenAI platforms, and SaaS subscriptions. AWS, Azure, GCP, OpenAI, Anthropic, and 50+ more integrations.",
  openGraph: {
    title: siteTitle("Integrations"),
    description: "50+ integrations with cloud providers, GenAI platforms, and SaaS tools.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const CLOUD_INTEGRATIONS = [
  { name: "Amazon Web Services", shortName: "AWS", description: "EC2, S3, Lambda, RDS, and 200+ services" },
  { name: "Google Cloud Platform", shortName: "GCP", description: "Compute Engine, BigQuery, Cloud Functions" },
  { name: "Microsoft Azure", shortName: "Azure", description: "VMs, Blob Storage, Azure Functions" },
  { name: "DigitalOcean", shortName: "DO", description: "Droplets, Spaces, App Platform" },
  { name: "Oracle Cloud", shortName: "OCI", description: "Compute, Object Storage, Autonomous DB" },
  { name: "IBM Cloud", shortName: "IBM", description: "Virtual Servers, Cloud Object Storage" },
]

const GENAI_INTEGRATIONS = [
  { name: "OpenAI", shortName: "OpenAI", description: "GPT-4, GPT-3.5, DALL-E, Whisper" },
  { name: "Anthropic", shortName: "Claude", description: "Claude 3.5, Claude 3 Opus, Sonnet, Haiku" },
  { name: "Google AI", shortName: "Gemini", description: "Gemini Pro, Gemini Ultra, PaLM" },
  { name: "Cohere", shortName: "Cohere", description: "Command, Embed, Rerank models" },
  { name: "Mistral AI", shortName: "Mistral", description: "Mistral Large, Medium, Small" },
  { name: "Amazon Bedrock", shortName: "Bedrock", description: "Claude, Titan, Llama on AWS" },
]

const SAAS_INTEGRATIONS = [
  { name: "Slack", category: "Communication" },
  { name: "GitHub", category: "Development" },
  { name: "Jira", category: "Project Management" },
  { name: "Salesforce", category: "CRM" },
  { name: "HubSpot", category: "Marketing" },
  { name: "Notion", category: "Documentation" },
  { name: "Figma", category: "Design" },
  { name: "Datadog", category: "Monitoring" },
  { name: "Snowflake", category: "Data" },
  { name: "MongoDB Atlas", category: "Database" },
  { name: "Vercel", category: "Deployment" },
  { name: "Stripe", category: "Payments" },
]

const INTEGRATION_FEATURES = [
  {
    icon: Zap,
    title: "5-Minute Setup",
    description: "Connect your accounts in minutes with our guided setup wizard. No code required.",
  },
  {
    icon: RefreshCw,
    title: "Real-Time Sync",
    description: "Automatic data sync keeps your cost data up-to-date across all platforms.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "SOC 2 Type II certified with encrypted credentials and audit logging.",
  },
  {
    icon: Clock,
    title: "Historical Import",
    description: "Import up to 12 months of historical data for trend analysis.",
  },
]

export default function IntegrationsPage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Plug className="w-4 h-4" style={{ color: '#ffffff' }} />
            Integrations
          </div>
          <h1 className="ca-page-hero-title">
            Connect Your{" "}
            <span className="font-semibold">Entire Stack</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            50+ integrations with cloud providers, GenAI platforms, and SaaS tools.
            Get unified cost visibility in minutes.
          </p>
          <div className="ca-hero-buttons">
            <Link href="/signup" className="ca-btn-hero-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/contact" className="ca-btn-hero-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Request Integration
            </Link>
          </div>
        </div>
      </section>

      {/* Cloud Integrations */}
      <section className="ca-integrations-section">
        <div className="ca-section-header-centered">
          <div className="ca-integrations-category-icon ca-integrations-category-icon-cloud">
            <Cloud className="w-8 h-8" />
          </div>
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Cloud className="w-4 h-4" style={{ color: '#ffffff' }} />
            Cloud Providers
          </span>
          <h2 className="ca-section-title">Multi-Cloud Cost Tracking</h2>
          <p className="ca-section-subtitle">
            Connect all your cloud providers for unified cost visibility and optimization insights.
          </p>
        </div>

        <div className="ca-integrations-grid">
          {CLOUD_INTEGRATIONS.map((integration) => (
            <div key={integration.name} className="ca-integration-card">
              <div className="ca-integration-logo">
                <span className="ca-integration-logo-text">{integration.shortName}</span>
              </div>
              <h3 className="ca-integration-name">{integration.name}</h3>
              <p className="ca-integration-desc">{integration.description}</p>
              <div className="ca-integration-status">
                <Check className="w-4 h-4 ca-icon-mint" />
                <span>Available</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* GenAI Integrations */}
      <section className="ca-integrations-section">
        <div className="ca-section-header-centered">
          <div className="ca-integrations-category-icon ca-integrations-category-icon-genai">
            <Cpu className="w-8 h-8" />
          </div>
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Cpu className="w-4 h-4" style={{ color: '#ffffff' }} />
            GenAI Platforms
          </span>
          <h2 className="ca-section-title">LLM Cost Management</h2>
          <p className="ca-section-subtitle">
            Track token usage, model costs, and optimize your AI spend across all providers.
          </p>
        </div>

        <div className="ca-integrations-grid">
          {GENAI_INTEGRATIONS.map((integration) => (
            <div key={integration.name} className="ca-integration-card">
              <div className="ca-integration-logo ca-integration-logo-genai">
                <span className="ca-integration-logo-text">{integration.shortName}</span>
              </div>
              <h3 className="ca-integration-name">{integration.name}</h3>
              <p className="ca-integration-desc">{integration.description}</p>
              <div className="ca-integration-status">
                <Check className="w-4 h-4 ca-icon-mint" />
                <span>Available</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SaaS Integrations */}
      <section className="ca-integrations-section">
        <div className="ca-section-header-centered">
          <div className="ca-integrations-category-icon ca-integrations-category-icon-saas">
            <CreditCard className="w-8 h-8" />
          </div>
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <CreditCard className="w-4 h-4" style={{ color: '#ffffff' }} />
            SaaS Subscriptions
          </span>
          <h2 className="ca-section-title">Subscription Tracking</h2>
          <p className="ca-section-subtitle">
            Monitor and optimize your SaaS spend with automatic subscription discovery.
          </p>
        </div>

        <div className="ca-integrations-saas-grid">
          {SAAS_INTEGRATIONS.map((integration) => (
            <div key={integration.name} className="ca-integration-saas-card">
              <span className="ca-integration-saas-name">{integration.name}</span>
              <span className="ca-integration-saas-category">{integration.category}</span>
            </div>
          ))}
        </div>

        <div className="ca-integrations-more">
          <p>And 30+ more SaaS integrations</p>
          <Link href="/contact" className="ca-btn-hero-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
            Request Integration
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="ca-integrations-features-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <Settings className="w-4 h-4" style={{ color: '#ffffff' }} />
            How It Works
          </span>
          <h2 className="ca-section-title">Seamless Integration Experience</h2>
        </div>

        <div className="ca-integrations-features-grid">
          {INTEGRATION_FEATURES.map((feature) => {
            const Icon = feature.icon
            return (
              <div key={feature.title} className="ca-integrations-feature-card">
                <div className="ca-integrations-feature-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="ca-integrations-feature-title">{feature.title}</h3>
                <p className="ca-integrations-feature-desc">{feature.description}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} />
            Get Started Today
          </div>
          <h2 className="ca-final-cta-title">Ready to Connect Your Stack?</h2>
          <p className="ca-final-cta-subtitle">
            Start your 14-day free trial and connect all your cloud, GenAI, and SaaS accounts in minutes.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/demo" className="ca-btn-cta-secondary" style={{ backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}>
              Book a Demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
