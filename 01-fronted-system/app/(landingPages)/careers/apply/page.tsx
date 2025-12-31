"use client"

import { useState, type FormEvent, type ChangeEvent, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  Briefcase,
  ArrowRight,
  Upload,
  X,
  CheckCircle2,
  FileText,
  Mail,
  User,
  Phone,
  Linkedin,
  Github,
  Globe,
  Paperclip,
  Send,
} from "lucide-react"
import "../../premium.css"

interface FormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  position: string
  linkedin: string
  github: string
  portfolio: string
  coverLetter: string
}

interface FileAttachment {
  name: string
  size: number
  type: string
  file: File
}

const POSITIONS = [
  "Senior Backend Engineer",
  "Senior Frontend Engineer",
  "Product Manager",
  "Solutions Engineer",
  "General Application",
]

function CareerApplyForm() {
  const searchParams = useSearchParams()
  const positionParam = searchParams.get("position") || ""

  const [formData, setFormData] = useState<FormData>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    position: positionParam,
    linkedin: "",
    github: "",
    portfolio: "",
    coverLetter: "",
  })
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required"
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required"
    if (!formData.email.trim()) {
      newErrors.email = "Email is required"
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email"
    }
    if (!formData.position) newErrors.position = "Please select a position"
    if (attachments.length === 0) newErrors.resume = "Please attach your resume"
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return

    const newAttachments: FileAttachment[] = []
    const maxSize = 10 * 1024 * 1024 // 10MB
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ]

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.size > maxSize) {
        setErrors(prev => ({ ...prev, files: `${file.name} is too large. Max size is 10MB.` }))
        continue
      }
      if (!allowedTypes.includes(file.type)) {
        setErrors(prev => ({ ...prev, files: `${file.name} is not a supported file type.` }))
        continue
      }
      newAttachments.push({
        name: file.name,
        size: file.size,
        type: file.type,
        file: file,
      })
    }

    setAttachments(prev => [...prev, ...newAttachments])
    if (errors.files) {
      setErrors(prev => { const e = { ...prev }; delete e.files; return e })
    }
    if (errors.resume) {
      setErrors(prev => { const e = { ...prev }; delete e.resume; return e })
    }
  }

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)

    // Build mailto link with form data (files will need to be attached manually or use a form submission service)
    const subject = `Job Application: ${formData.position} - ${formData.firstName} ${formData.lastName}`
    const body = `
Job Application for: ${formData.position}

PERSONAL INFORMATION
--------------------
Name: ${formData.firstName} ${formData.lastName}
Email: ${formData.email}
Phone: ${formData.phone || "Not provided"}

ONLINE PROFILES
---------------
LinkedIn: ${formData.linkedin || "Not provided"}
GitHub: ${formData.github || "Not provided"}
Portfolio: ${formData.portfolio || "Not provided"}

COVER LETTER
------------
${formData.coverLetter || "Not provided"}

ATTACHMENTS
-----------
${attachments.map(a => `- ${a.name} (${formatFileSize(a.size)})`).join("\n")}

Note: Please reply to this email to receive the attached files, or the applicant can send them in a follow-up email.
    `.trim()

    // Create mailto link
    const mailtoLink = `mailto:careers@cloudact.ai?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

    // Open email client
    window.location.href = mailtoLink

    // Show success after a short delay
    setTimeout(() => {
      setIsSubmitting(false)
      setIsSuccess(true)
    }, 1000)
  }

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => { const e = { ...prev }; delete e[field]; return e })
    }
  }

  return (
    <div className="ca-landing-page">
      {/* Hero Section */}
      <section className="ca-apply-hero">
        <div className="ca-apply-hero-content">
          <Link href="/careers" className="ca-apply-back-link">
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Careers
          </Link>
          <div className="ca-section-eyebrow">
            <Briefcase className="w-4 h-4" />
            Apply Now
          </div>
          <h1 className="ca-apply-hero-title">
            Join the <span className="ca-hero-highlight-mint">CloudAct.ai</span> Team
          </h1>
          <p className="ca-apply-hero-subtitle">
            Submit your application and we'll be in touch within 48 hours.
          </p>
        </div>
      </section>

      {/* Application Form Section */}
      <section className="ca-apply-form-section">
        <div className="ca-apply-form-container">
          {isSuccess ? (
            <div className="ca-apply-success">
              <CheckCircle2 className="w-16 h-16" />
              <h2>Application Submitted!</h2>
              <p>
                Your email client should have opened with your application details.
                Please send the email and attach your resume/files before sending.
              </p>
              <p className="ca-apply-success-note">
                If your email client didn't open, please send your application directly to{" "}
                <a href="mailto:careers@cloudact.ai">careers@cloudact.ai</a>
              </p>
              <div className="ca-apply-success-actions">
                <button
                  type="button"
                  onClick={() => {
                    setIsSuccess(false)
                    setFormData({
                      firstName: "",
                      lastName: "",
                      email: "",
                      phone: "",
                      position: "",
                      linkedin: "",
                      github: "",
                      portfolio: "",
                      coverLetter: "",
                    })
                    setAttachments([])
                  }}
                  className="ca-btn-hero-secondary"
                >
                  Submit Another Application
                </button>
                <Link href="/careers" className="ca-btn-hero-primary">
                  View Other Positions
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="ca-apply-form">
              <h2 className="ca-apply-form-title">Application Form</h2>

              {/* Personal Information */}
              <div className="ca-apply-form-section-title">
                <User className="w-5 h-5" />
                Personal Information
              </div>

              <div className="ca-apply-form-row">
                <div className="ca-apply-form-field">
                  <label htmlFor="firstName">First Name *</label>
                  <input
                    id="firstName"
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => handleChange("firstName", e.target.value)}
                    placeholder="John"
                    className={errors.firstName ? "error" : ""}
                  />
                  {errors.firstName && <span className="ca-apply-form-error">{errors.firstName}</span>}
                </div>
                <div className="ca-apply-form-field">
                  <label htmlFor="lastName">Last Name *</label>
                  <input
                    id="lastName"
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => handleChange("lastName", e.target.value)}
                    placeholder="Doe"
                    className={errors.lastName ? "error" : ""}
                  />
                  {errors.lastName && <span className="ca-apply-form-error">{errors.lastName}</span>}
                </div>
              </div>

              <div className="ca-apply-form-row">
                <div className="ca-apply-form-field">
                  <label htmlFor="email">
                    <Mail className="w-4 h-4" />
                    Email Address *
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="john@example.com"
                    className={errors.email ? "error" : ""}
                  />
                  {errors.email && <span className="ca-apply-form-error">{errors.email}</span>}
                </div>
                <div className="ca-apply-form-field">
                  <label htmlFor="phone">
                    <Phone className="w-4 h-4" />
                    Phone Number
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+1 (555) 123-4567"
                  />
                </div>
              </div>

              {/* Position */}
              <div className="ca-apply-form-field">
                <label htmlFor="position">
                  <Briefcase className="w-4 h-4" />
                  Position *
                </label>
                <select
                  id="position"
                  value={formData.position}
                  onChange={(e) => handleChange("position", e.target.value)}
                  className={errors.position ? "error" : ""}
                >
                  <option value="">Select a position</option>
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
                {errors.position && <span className="ca-apply-form-error">{errors.position}</span>}
              </div>

              {/* Online Profiles */}
              <div className="ca-apply-form-section-title">
                <Globe className="w-5 h-5" />
                Online Profiles (Optional)
              </div>

              <div className="ca-apply-form-row">
                <div className="ca-apply-form-field">
                  <label htmlFor="linkedin">
                    <Linkedin className="w-4 h-4" />
                    LinkedIn URL
                  </label>
                  <input
                    id="linkedin"
                    type="url"
                    value={formData.linkedin}
                    onChange={(e) => handleChange("linkedin", e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
                <div className="ca-apply-form-field">
                  <label htmlFor="github">
                    <Github className="w-4 h-4" />
                    GitHub URL
                  </label>
                  <input
                    id="github"
                    type="url"
                    value={formData.github}
                    onChange={(e) => handleChange("github", e.target.value)}
                    placeholder="https://github.com/..."
                  />
                </div>
              </div>

              <div className="ca-apply-form-field">
                <label htmlFor="portfolio">
                  <Globe className="w-4 h-4" />
                  Portfolio / Website
                </label>
                <input
                  id="portfolio"
                  type="url"
                  value={formData.portfolio}
                  onChange={(e) => handleChange("portfolio", e.target.value)}
                  placeholder="https://..."
                />
              </div>

              {/* Resume & Attachments */}
              <div className="ca-apply-form-section-title">
                <Paperclip className="w-5 h-5" />
                Resume & Attachments *
              </div>

              <div className="ca-apply-file-upload">
                <input
                  type="file"
                  id="fileUpload"
                  multiple
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                  className="ca-apply-file-input"
                />
                <label htmlFor="fileUpload" className="ca-apply-file-label">
                  <Upload className="w-6 h-6" />
                  <span className="ca-apply-file-label-text">
                    Click to upload or drag and drop
                  </span>
                  <span className="ca-apply-file-label-hint">
                    PDF, DOC, DOCX, PNG, JPG (max 10MB each)
                  </span>
                </label>
                {errors.resume && <span className="ca-apply-form-error">{errors.resume}</span>}
                {errors.files && <span className="ca-apply-form-error">{errors.files}</span>}
              </div>

              {attachments.length > 0 && (
                <div className="ca-apply-attachments-list">
                  {attachments.map((file, index) => (
                    <div key={index} className="ca-apply-attachment">
                      <FileText className="w-4 h-4" />
                      <span className="ca-apply-attachment-name">{file.name}</span>
                      <span className="ca-apply-attachment-size">{formatFileSize(file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        className="ca-apply-attachment-remove"
                        aria-label="Remove file"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Cover Letter */}
              <div className="ca-apply-form-section-title">
                <FileText className="w-5 h-5" />
                Cover Letter (Optional)
              </div>

              <div className="ca-apply-form-field">
                <label htmlFor="coverLetter">Tell us about yourself</label>
                <textarea
                  id="coverLetter"
                  value={formData.coverLetter}
                  onChange={(e) => handleChange("coverLetter", e.target.value)}
                  placeholder="Why are you interested in this role? What makes you a great fit?"
                  rows={6}
                />
              </div>

              {/* Submit */}
              <div className="ca-apply-form-note">
                <p>
                  Your application will be sent via email to our hiring team.
                  No data is stored on our servers. Please attach your resume
                  files when your email client opens.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="ca-apply-submit-btn"
              >
                {isSubmitting ? (
                  <>
                    <span className="ca-apply-spinner" />
                    Preparing Application...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit Application
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* Privacy Note */}
      <section className="ca-apply-privacy-section">
        <div className="ca-apply-privacy-content">
          <h3>Your Privacy Matters</h3>
          <p>
            We do not store your application data on our servers. Your application
            is sent directly via email to our hiring team at careers@cloudact.ai.
            By submitting, you agree to our{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </div>
  )
}

export default function CareerApplyPage() {
  return (
    <Suspense fallback={<div className="ca-landing-page"><div className="ca-apply-hero"><div className="ca-apply-hero-content"><p>Loading...</p></div></div></div>}>
      <CareerApplyForm />
    </Suspense>
  )
}
