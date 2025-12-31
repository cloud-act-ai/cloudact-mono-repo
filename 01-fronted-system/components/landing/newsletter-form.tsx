"use client"

import { useState, type FormEvent } from "react"
import { CheckCircle2, Send, AlertCircle } from "lucide-react"

interface NewsletterFormProps {
  source?: string
  inputClassName?: string
  buttonClassName?: string
  showLabels?: boolean
}

export function NewsletterForm({
  source = "website",
  inputClassName = "ca-resources-newsletter-input",
  buttonClassName = "ca-btn-hero-primary",
  showLabels = false,
}: NewsletterFormProps) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      setErrorMessage("Please enter your email address")
      setStatus("error")
      return
    }

    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) {
      setErrorMessage("Please enter a valid email address")
      setStatus("error")
      return
    }

    setStatus("submitting")
    setErrorMessage("")

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      })

      const data = await response.json()

      if (!response.ok) {
        setErrorMessage(data.error || "Something went wrong. Please try again.")
        setStatus("error")
        return
      }

      setStatus("success")
      setEmail("")
    } catch {
      setErrorMessage("Network error. Please check your connection and try again.")
      setStatus("error")
    }
  }

  if (status === "success") {
    return (
      <div className="ca-newsletter-success">
        <CheckCircle2 className="w-6 h-6 ca-icon-mint" />
        <span>You&apos;re subscribed! Check your inbox for a welcome email.</span>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="ca-resources-newsletter-form" aria-label="Newsletter signup">
      {showLabels && (
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
      )}
      <input
        id="newsletter-email"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value)
          if (status === "error") {
            setStatus("idle")
            setErrorMessage("")
          }
        }}
        placeholder="Enter your email"
        className={`${inputClassName} ${status === "error" ? "error" : ""}`}
        aria-label="Email address"
        autoComplete="email"
        disabled={status === "submitting"}
      />
      <button
        type="submit"
        className={buttonClassName}
        disabled={status === "submitting"}
        aria-busy={status === "submitting"}
      >
        {status === "submitting" ? (
          <>
            <span className="ca-form-spinner" aria-hidden="true" />
            <span>Subscribing...</span>
          </>
        ) : (
          <>
            <span>Subscribe</span>
            <Send className="w-5 h-5" aria-hidden="true" />
          </>
        )}
      </button>
      {status === "error" && (
        <div className="ca-newsletter-error">
          <AlertCircle className="w-4 h-4" />
          <span>{errorMessage}</span>
        </div>
      )}
    </form>
  )
}
