import type { Metadata } from "next"
import Link from "next/link"
import {
  Code,
  ArrowRight,
  Terminal,
  Key,
  Server,
  Shield,
  Clock,
  Copy,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import "../../../premium.css"

export const metadata: Metadata = {
  title: "API Reference | CloudAct.ai Documentation",
  description: "CloudAct.ai REST API documentation. Authentication, endpoints, rate limits, and code examples.",
  openGraph: {
    title: "API Reference | CloudAct.ai",
    description: "CloudAct.ai REST API documentation.",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
}

const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/costs/summary",
    description: "Get cost summary for the current billing period",
    params: ["start_date", "end_date", "group_by"],
  },
  {
    method: "GET",
    path: "/api/v1/costs/daily",
    description: "Get daily cost breakdown",
    params: ["start_date", "end_date", "provider"],
  },
  {
    method: "GET",
    path: "/api/v1/integrations",
    description: "List all connected integrations",
    params: ["status", "provider_type"],
  },
  {
    method: "POST",
    path: "/api/v1/integrations/{provider}/setup",
    description: "Configure a new integration",
    params: ["credential", "config"],
  },
  {
    method: "GET",
    path: "/api/v1/alerts",
    description: "List cost anomaly alerts",
    params: ["status", "severity", "limit"],
  },
  {
    method: "GET",
    path: "/api/v1/reports/generate",
    description: "Generate a cost report",
    params: ["report_type", "format", "date_range"],
  },
]

const CODE_EXAMPLES = {
  auth: `# All API requests require an API key
curl -X GET "https://api.cloudact.ai/api/v1/costs/summary" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
  python: `import requests

API_KEY = "your_api_key"
BASE_URL = "https://api.cloudact.ai/api/v1"

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

# Get cost summary
response = requests.get(
    f"{BASE_URL}/costs/summary",
    headers=headers,
    params={
        "start_date": "2024-01-01",
        "end_date": "2024-01-31"
    }
)

data = response.json()
print(f"Total cost: ${data['total_cost']}")`,
  javascript: `const API_KEY = 'your_api_key';
const BASE_URL = 'https://api.cloudact.ai/api/v1';

// Get cost summary
async function getCostSummary() {
  const response = await fetch(
    \`\${BASE_URL}/costs/summary?start_date=2024-01-01&end_date=2024-01-31\`,
    {
      headers: {
        'Authorization': \`Bearer \${API_KEY}\`,
        'Content-Type': 'application/json'
      }
    }
  );

  const data = await response.json();
  console.log(\`Total cost: $\${data.total_cost}\`);
}`,
}

export default function APIReferencePage() {
  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-docs-hero">
        <div className="ca-docs-hero-content">
          <Link href="/docs" className="ca-docs-back-link">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Documentation
          </Link>
          <div className="ca-section-eyebrow">
            <Code className="w-4 h-4" />
            API Reference
          </div>
          <h1 className="ca-docs-hero-title">
            CloudAct <span className="ca-hero-highlight-mint">REST API</span>
          </h1>
          <p className="ca-docs-hero-subtitle">
            Programmatic access to your cost data, integrations, and reports.
          </p>
          <div className="ca-docs-api-badges">
            <span className="ca-docs-api-badge">
              <Server className="w-4 h-4" />
              REST API
            </span>
            <span className="ca-docs-api-badge">
              <Shield className="w-4 h-4" />
              TLS 1.3
            </span>
            <span className="ca-docs-api-badge">
              <Clock className="w-4 h-4" />
              99.9% Uptime
            </span>
          </div>
        </div>
      </section>

      {/* Authentication Section */}
      <section className="ca-docs-section">
        <div className="ca-docs-section-container">
          <div className="ca-docs-section-header">
            <Key className="w-6 h-6" />
            <h2>Authentication</h2>
          </div>
          <div className="ca-docs-section-content">
            <p>
              All API requests require authentication using an API key. You can generate
              API keys from your organization settings in the CloudAct.ai dashboard.
            </p>
            <div className="ca-docs-alert ca-docs-alert-info">
              <AlertCircle className="w-5 h-5" />
              <div>
                <strong>Security Note:</strong> Keep your API keys secure. Do not expose
                them in client-side code or public repositories.
              </div>
            </div>
            <div className="ca-docs-code-block">
              <div className="ca-docs-code-header">
                <span>Authentication Header</span>
                <button type="button" className="ca-docs-code-copy" aria-label="Copy code">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <pre className="ca-docs-code-content">
                <code>{CODE_EXAMPLES.auth}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Base URL Section */}
      <section className="ca-docs-section ca-docs-section-alt">
        <div className="ca-docs-section-container">
          <div className="ca-docs-section-header">
            <Server className="w-6 h-6" />
            <h2>Base URL</h2>
          </div>
          <div className="ca-docs-section-content">
            <div className="ca-docs-base-url">
              <code>https://api.cloudact.ai/api/v1</code>
            </div>
            <p>
              All API endpoints are relative to this base URL. The API uses JSON for
              request and response bodies.
            </p>
          </div>
        </div>
      </section>

      {/* Endpoints Section */}
      <section className="ca-docs-section">
        <div className="ca-docs-section-container">
          <div className="ca-docs-section-header">
            <Terminal className="w-6 h-6" />
            <h2>Endpoints</h2>
          </div>
          <div className="ca-docs-endpoints-list">
            {API_ENDPOINTS.map((endpoint, i) => (
              <div key={i} className="ca-docs-endpoint">
                <div className="ca-docs-endpoint-header">
                  <span className={`ca-docs-endpoint-method ca-docs-method-${endpoint.method.toLowerCase()}`}>
                    {endpoint.method}
                  </span>
                  <code className="ca-docs-endpoint-path">{endpoint.path}</code>
                </div>
                <p className="ca-docs-endpoint-desc">{endpoint.description}</p>
                <div className="ca-docs-endpoint-params">
                  <span className="ca-docs-endpoint-params-label">Parameters:</span>
                  {endpoint.params.map((param, j) => (
                    <code key={j} className="ca-docs-endpoint-param">{param}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Code Examples Section */}
      <section className="ca-docs-section ca-docs-section-alt">
        <div className="ca-docs-section-container">
          <div className="ca-docs-section-header">
            <Code className="w-6 h-6" />
            <h2>Code Examples</h2>
          </div>
          <div className="ca-docs-code-examples">
            <div className="ca-docs-code-block">
              <div className="ca-docs-code-header">
                <span>Python</span>
                <button type="button" className="ca-docs-code-copy" aria-label="Copy code">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <pre className="ca-docs-code-content">
                <code>{CODE_EXAMPLES.python}</code>
              </pre>
            </div>

            <div className="ca-docs-code-block">
              <div className="ca-docs-code-header">
                <span>JavaScript</span>
                <button type="button" className="ca-docs-code-copy" aria-label="Copy code">
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <pre className="ca-docs-code-content">
                <code>{CODE_EXAMPLES.javascript}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* Rate Limits Section */}
      <section className="ca-docs-section">
        <div className="ca-docs-section-container">
          <div className="ca-docs-section-header">
            <Clock className="w-6 h-6" />
            <h2>Rate Limits</h2>
          </div>
          <div className="ca-docs-section-content">
            <div className="ca-docs-rate-limits">
              <div className="ca-docs-rate-limit">
                <span className="ca-docs-rate-limit-tier">Starter</span>
                <span className="ca-docs-rate-limit-value">100 requests/min</span>
              </div>
              <div className="ca-docs-rate-limit">
                <span className="ca-docs-rate-limit-tier">Professional</span>
                <span className="ca-docs-rate-limit-value">500 requests/min</span>
              </div>
              <div className="ca-docs-rate-limit">
                <span className="ca-docs-rate-limit-tier">Scale</span>
                <span className="ca-docs-rate-limit-value">2000 requests/min</span>
              </div>
            </div>
            <p>
              Rate limit headers are included in all API responses. If you exceed the
              limit, you'll receive a 429 status code.
            </p>
          </div>
        </div>
      </section>

      {/* Support Section */}
      <section className="ca-docs-section ca-docs-section-alt">
        <div className="ca-docs-section-container">
          <div className="ca-docs-support">
            <h3>Need Help?</h3>
            <p>
              Our developer support team is here to help you integrate with the CloudAct.ai API.
            </p>
            <div className="ca-docs-support-links">
              <Link href="/help" className="ca-docs-support-link">
                <CheckCircle2 className="w-5 h-5" />
                Help Center
              </Link>
              <Link href="/contact" className="ca-docs-support-link">
                <Terminal className="w-5 h-5" />
                Developer Support
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="ca-final-cta-section">
        <div className="ca-final-cta-container">
          <h2 className="ca-final-cta-title">Ready to Build?</h2>
          <p className="ca-final-cta-subtitle">
            Start integrating CloudAct.ai into your applications today.
          </p>
          <div className="ca-final-cta-buttons">
            <Link href="/signup" className="ca-btn-cta-primary">
              Get API Key
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link href="/docs/quick-start" className="ca-btn-cta-secondary">
              Quick Start Guide
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
