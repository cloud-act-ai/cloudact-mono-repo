"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Search,
  MessageSquare,
  Mail,
  Phone,
  Book,
  FileText,
  Video,
  Users,
  ArrowRight,
  HelpCircle,
  Zap,
  Shield,
  CreditCard,
  Settings,
  Cloud,
  Cpu,
  ChevronDown,
  ExternalLink,
  Sparkles,
} from "lucide-react"
import "../premium.css"

const HELP_CATEGORIES = [
  {
    icon: Zap,
    title: "Getting Started",
    description: "Quick start guides and tutorials",
    articles: 12,
    href: "/docs/quick-start",
  },
  {
    icon: Cloud,
    title: "Cloud Integrations",
    description: "Connect AWS, Azure, GCP",
    articles: 18,
    href: "/integrations",
  },
  {
    icon: Cpu,
    title: "GenAI Tracking",
    description: "LLM cost monitoring setup",
    articles: 8,
    href: "/features#genai",
  },
  {
    icon: CreditCard,
    title: "Billing & Payments",
    description: "Subscription and invoice help",
    articles: 10,
    href: "/pricing",
  },
  {
    icon: Settings,
    title: "Account Settings",
    description: "Team management and preferences",
    articles: 14,
    href: "/docs/api/reference",
  },
  {
    icon: Shield,
    title: "Security & Privacy",
    description: "Data protection and compliance",
    articles: 6,
    href: "/security",
  },
]

const POPULAR_ARTICLES = [
  { title: "How to connect your AWS account", category: "Cloud Integrations", href: "/integrations" },
  { title: "Understanding your GenAI cost breakdown", category: "GenAI Tracking", href: "/features#genai" },
  { title: "Setting up team members and permissions", category: "Account Settings", href: "/docs/api/reference" },
  { title: "Configuring cost alerts and budgets", category: "Getting Started", href: "/features#alerts" },
  { title: "Exporting reports and data", category: "Analytics", href: "/features#analytics" },
  { title: "Managing your subscription plan", category: "Billing", href: "/pricing" },
]

const FAQS = [
  {
    question: "How do I reset my password?",
    answer: "You can reset your password by clicking 'Forgot Password' on the login page. We'll send a reset link to your registered email address. The link expires after 24 hours for security.",
  },
  {
    question: "Can I add multiple cloud accounts?",
    answer: "Yes! CloudAct.ai supports multiple cloud accounts across AWS, Azure, and GCP. You can add as many accounts as your plan allows from the Integrations page in your dashboard.",
  },
  {
    question: "How often is cost data updated?",
    answer: "Cost data is synchronized daily by default. Most cloud providers have a 24-48 hour delay in reporting. GenAI costs from API providers are typically available within a few hours.",
  },
  {
    question: "What's included in the free trial?",
    answer: "The 14-day free trial includes full access to all features of the Professional plan. No credit card required. You can connect up to 3 cloud accounts and track unlimited GenAI providers.",
  },
  {
    question: "How do I cancel my subscription?",
    answer: "You can cancel your subscription anytime from Settings > Billing > Manage Subscription. You'll continue to have access until the end of your billing period. No refunds for partial months.",
  },
  {
    question: "Is my data secure?",
    answer: "Absolutely. We're SOC 2 Type II certified and GDPR compliant. All data is encrypted at rest and in transit. We never store your cloud provider credentials - we use secure OAuth connections.",
  },
]

const SUPPORT_CHANNELS = [
  {
    icon: MessageSquare,
    title: "Live Chat",
    description: "Chat with our support team",
    availability: "Mon-Fri, 9am-6pm PT",
    action: "Start Chat",
    primary: true,
  },
  {
    icon: Mail,
    title: "Email Support",
    description: "Get help via email",
    availability: "Response within 24 hours",
    action: "Send Email",
    href: "mailto:support@cloudact.ai",
  },
  {
    icon: Phone,
    title: "Phone Support",
    description: "Enterprise customers only",
    availability: "24/7 for Scale plans",
    action: "Call (850) 988-7471",
    href: "tel:+18509887471",
  },
]

const RESOURCES = [
  {
    icon: Book,
    title: "Documentation",
    description: "Complete API and integration docs",
    href: "/docs",
  },
  {
    icon: Video,
    title: "Video Tutorials",
    description: "Step-by-step walkthroughs",
    href: "/resources/videos",
  },
  {
    icon: FileText,
    title: "Blog",
    description: "Tips, updates, and best practices",
    href: "/resources/blog",
  },
  {
    icon: Users,
    title: "Community",
    description: "Connect with other users",
    href: "/community",
  },
]

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index)
  }

  // Search functionality
  const normalizedQuery = searchQuery.toLowerCase().trim()

  const filteredCategories = isSearching
    ? HELP_CATEGORIES.filter(
        (cat) =>
          cat.title.toLowerCase().includes(normalizedQuery) ||
          cat.description.toLowerCase().includes(normalizedQuery)
      )
    : HELP_CATEGORIES

  const filteredArticles = isSearching
    ? POPULAR_ARTICLES.filter(
        (article) =>
          article.title.toLowerCase().includes(normalizedQuery) ||
          article.category.toLowerCase().includes(normalizedQuery)
      )
    : POPULAR_ARTICLES

  const filteredFaqs = isSearching
    ? FAQS.filter(
        (faq) =>
          faq.question.toLowerCase().includes(normalizedQuery) ||
          faq.answer.toLowerCase().includes(normalizedQuery)
      )
    : FAQS

  const totalResults = filteredCategories.length + filteredArticles.length + filteredFaqs.length
  const hasNoResults = isSearching && totalResults === 0

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setIsSearching(searchQuery.trim().length > 0)
  }

  const clearSearch = () => {
    setSearchQuery("")
    setIsSearching(false)
  }

  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-page-hero">
        <div className="ca-page-hero-content">
          <div className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <HelpCircle className="w-4 h-4" style={{ color: '#ffffff' }} />
            Help Center
          </div>
          <h1 className="ca-page-hero-title">
            How Can We{" "}
            <span className="ca-hero-highlight-mint" style={{ color: '#FF6C5E' }}>Help You?</span>
          </h1>
          <p className="ca-page-hero-subtitle">
            Search our knowledge base or browse categories to find answers to your questions.
          </p>

          {/* Search */}
          <form className="ca-help-search" role="search" aria-label="Search help articles" onSubmit={handleSearch}>
            <div className="ca-help-search-inner">
              <Search className="w-5 h-5" aria-hidden="true" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (e.target.value.trim() === "") {
                    setIsSearching(false)
                  }
                }}
                placeholder="Search for help articles..."
                className="ca-help-search-input"
                aria-label="Search help articles"
              />
              {isSearching && (
                <button type="button" onClick={clearSearch} className="ca-help-search-clear" aria-label="Clear search">
                  &times;
                </button>
              )}
              <button type="submit" className="ca-btn-hero-primary ca-help-search-btn" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
                Search
              </button>
            </div>
          </form>

          {/* Search Results Summary */}
          {isSearching && (
            <div className="ca-help-search-results-summary">
              {hasNoResults ? (
                <p className="ca-help-no-results">
                  No results found for &ldquo;{searchQuery}&rdquo;. Try a different search term or{" "}
                  <Link href="/contact">contact support</Link>.
                </p>
              ) : (
                <p>
                  Found {totalResults} result{totalResults !== 1 ? "s" : ""} for &ldquo;{searchQuery}&rdquo;
                  <button type="button" onClick={clearSearch} className="ca-help-clear-search-link">
                    Clear search
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Help Categories */}
      {filteredCategories.length > 0 && (
        <section className="ca-help-categories-section">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <Book className="w-4 h-4" style={{ color: '#ffffff' }} />
              Browse by Topic
            </span>
            <h2 className="ca-section-title">Help Categories</h2>
          </div>

          <div className="ca-help-categories-grid">
            {filteredCategories.map((category) => {
              const Icon = category.icon
              return (
                <Link key={category.title} href={category.href} className="ca-help-category-card">
                  <div className="ca-help-category-icon">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="ca-help-category-title">{category.title}</h3>
                  <p className="ca-help-category-desc">{category.description}</p>
                  <div className="ca-help-category-footer">
                    <span>{category.articles} articles</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Popular Articles */}
      {filteredArticles.length > 0 && (
        <section className="ca-help-articles-section">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <Zap className="w-4 h-4" style={{ color: '#ffffff' }} />
              Quick Answers
            </span>
            <h2 className="ca-section-title">Popular Articles</h2>
          </div>

          <div className="ca-help-articles-list">
            {filteredArticles.map((article) => (
              <Link key={article.title} href={article.href} className="ca-help-article-card">
                <div className="ca-help-article-content">
                  <HelpCircle className="w-5 h-5 ca-icon-mint" />
                  <div>
                    <h3 className="ca-help-article-title">{article.title}</h3>
                    <span className="ca-help-article-category">{article.category}</span>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* FAQ Section */}
      {filteredFaqs.length > 0 && (
        <section className="ca-help-faq-section">
          <div className="ca-section-header-centered">
            <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
              <HelpCircle className="w-4 h-4" style={{ color: '#ffffff' }} />
              FAQ
            </span>
            <h2 className="ca-section-title">Frequently Asked Questions</h2>
          </div>

          <div className="ca-help-faq-container" role="region" aria-label="Frequently Asked Questions">
            {filteredFaqs.map((faq, index) => {
              const originalIndex = FAQS.findIndex(f => f.question === faq.question)
              return (
                <div
                  key={originalIndex}
                  className={`ca-help-faq-item ${openFaqIndex === originalIndex ? "ca-help-faq-item-open" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggleFaq(originalIndex)}
                    className="ca-help-faq-question"
                    aria-expanded={openFaqIndex === originalIndex}
                    aria-controls={`help-faq-answer-${originalIndex}`}
                  >
                    <span>{faq.question}</span>
                    <ChevronDown className={`w-5 h-5 ca-help-faq-icon ${openFaqIndex === originalIndex ? "ca-help-faq-icon-open" : ""}`} />
                  </button>
                  {openFaqIndex === originalIndex && (
                    <div id={`help-faq-answer-${originalIndex}`} className="ca-help-faq-answer" role="region">
                      <p>{faq.answer}</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Support Channels */}
      <section className="ca-help-support-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <MessageSquare className="w-4 h-4" style={{ color: '#ffffff' }} />
            Contact Support
          </span>
          <h2 className="ca-section-title">Need More Help?</h2>
          <p className="ca-section-subtitle">
            Our support team is here to help. Choose your preferred contact method.
          </p>
        </div>

        <div className="ca-help-support-grid">
          {SUPPORT_CHANNELS.map((channel) => {
            const Icon = channel.icon
            return (
              <div key={channel.title} className={`ca-help-support-card ${channel.primary ? "ca-help-support-primary" : ""}`}>
                <div className="ca-help-support-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="ca-help-support-title">{channel.title}</h3>
                <p className="ca-help-support-desc">{channel.description}</p>
                <p className="ca-help-support-availability">{channel.availability}</p>
                {channel.href ? (
                  <a
                    href={channel.href}
                    className={channel.primary ? "ca-btn-hero-primary" : "ca-btn-hero-secondary"}
                    style={channel.primary ? { backgroundColor: '#90FCA6', color: '#0f172a' } : { backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}
                  >
                    {channel.action}
                    <ExternalLink className="w-4 h-4" />
                  </a>
                ) : (
                  <button
                    type="button"
                    className={channel.primary ? "ca-btn-hero-primary" : "ca-btn-hero-secondary"}
                    style={channel.primary ? { backgroundColor: '#90FCA6', color: '#0f172a' } : { backgroundColor: '#ffffff', color: '#0f172a', border: '1px solid #e2e8f0' }}
                  >
                    {channel.action}
                    <MessageSquare className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Additional Resources */}
      <section className="ca-help-resources-section">
        <div className="ca-section-header-centered">
          <span className="ca-section-eyebrow" style={{ backgroundColor: '#0f172a', color: '#ffffff' }}>
            <ExternalLink className="w-4 h-4" style={{ color: '#ffffff' }} />
            Resources
          </span>
          <h2 className="ca-section-title">Additional Resources</h2>
        </div>

        <div className="ca-help-resources-grid">
          {RESOURCES.map((resource) => {
            const Icon = resource.icon
            return (
              <Link key={resource.title} href={resource.href} className="ca-help-resource-card">
                <div className="ca-help-resource-icon">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="ca-help-resource-title">{resource.title}</h3>
                <p className="ca-help-resource-desc">{resource.description}</p>
                <span className="ca-help-resource-link">
                  Learn more
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <div className="ca-final-cta-badge" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
            <Sparkles className="w-4 h-4" style={{ color: '#ffffff' }} />
            Can't Find What You Need?
          </div>
          <h2 className="ca-final-cta-title">Contact Our Team</h2>
          <p className="ca-final-cta-subtitle">
            Our support team is available to help with any questions not covered in our help center.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/contact" className="ca-btn-cta-primary" style={{ backgroundColor: '#90FCA6', color: '#0f172a' }}>
              Contact Us
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
