"use client"

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  ImageIcon,
  Upload,
  Loader2,
  X,
  Trash2,
  Link as LinkIcon,
  Save,
  CheckCircle2,
} from "lucide-react"
import { uploadOrgLogo, deleteOrgLogo, updateOrgLogo } from "@/actions/organization-locale"

interface LogoUploadProps {
  orgSlug: string
  currentLogoUrl: string | null
  onLogoChange: (newLogoUrl: string | null) => void
  onError: (error: string) => void
  onSuccess: (message: string) => void
}

export function LogoUpload({
  orgSlug,
  currentLogoUrl,
  onLogoChange,
  onError,
  onSuccess,
}: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingUrl, setIsSavingUrl] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [urlInput, setUrlInput] = useState(currentLogoUrl || "")
  const [activeTab, setActiveTab] = useState<string>("upload")
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      onError("Invalid file type. Allowed: PNG, JPG, GIF, SVG, WebP")
      // Clear file input so user can re-select the same file after fixing the error
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    const maxSize = 1 * 1024 * 1024
    if (file.size > maxSize) {
      onError("File too large. Maximum size is 1MB")
      // Clear file input so user can re-select the same file after fixing the error
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }, [onError])

  const handleUpload = async () => {
    if (!selectedFile) {
      onError("Please select a file first")
      return
    }

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("logo", selectedFile)

      const result = await uploadOrgLogo(orgSlug, formData)

      if (result.success && result.logoUrl) {
        onLogoChange(result.logoUrl)
        setSelectedFile(null)
        setPreviewUrl(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        onSuccess("Logo uploaded successfully!")
      } else {
        // Clear file state on upload error to allow re-selection
        setSelectedFile(null)
        setPreviewUrl(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        onError(result.error || "Failed to upload logo")
      }
    } catch (err) {
      // Clear file state on error to allow re-selection
      setSelectedFile(null)
      setPreviewUrl(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      onError(err instanceof Error ? err.message : "Failed to upload logo")
    } finally {
      setIsUploading(false)
    }
  }

  const handleSaveUrl = async () => {
    if (!urlInput.trim()) {
      const result = await updateOrgLogo(orgSlug, null)
      if (result.success) {
        onLogoChange(null)
        onSuccess("Logo removed")
      } else {
        onError(result.error || "Failed to remove logo")
      }
      return
    }

    try {
      const url = new URL(urlInput)
      if (url.protocol !== "https:") {
        onError("Logo URL must use HTTPS")
        return
      }
    } catch {
      onError("Invalid URL format")
      return
    }

    setIsSavingUrl(true)
    try {
      const result = await updateOrgLogo(orgSlug, urlInput)
      if (result.success) {
        onLogoChange(urlInput)
        onSuccess("Logo URL saved successfully!")
      } else {
        onError(result.error || "Failed to save logo URL")
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save logo URL")
    } finally {
      setIsSavingUrl(false)
    }
  }

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const result = await deleteOrgLogo(orgSlug)
      if (result.success) {
        onLogoChange(null)
        setUrlInput("")
        onSuccess("Logo deleted successfully!")
      } else {
        onError(result.error || "Failed to delete logo")
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to delete logo")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleCancelSelection = () => {
    setSelectedFile(null)
    setPreviewUrl(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const triggerFileInput = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fileInputRef.current?.click()
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    const allowedTypes = ["image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      onError("Invalid file type. Allowed: PNG, JPG, GIF, SVG, WebP")
      return
    }

    const maxSize = 1 * 1024 * 1024
    if (file.size > maxSize) {
      onError("File too large. Maximum size is 1MB")
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const displayUrl = previewUrl || currentLogoUrl

  return (
    <div className="space-y-6">
      {/* Premium Card Container with White Glow */}
      <div
        className="bg-white rounded-2xl p-6 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.08)] border border-gray-100/80"
        style={{
          boxShadow: '0 4px 24px -6px rgba(0, 0, 0, 0.06), 0 1px 3px -1px rgba(0, 0, 0, 0.03)'
        }}
      >
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Logo Preview Section */}
          <div className="flex-shrink-0">
            <Label className="text-sm font-medium text-gray-900 mb-3 block tracking-tight">
              Preview
            </Label>

            {/* Clean Logo Preview Box */}
            <div
              className="group relative h-28 w-28 rounded-xl border border-gray-200 bg-white flex items-center justify-center overflow-hidden transition-all duration-300 hover:border-[#90FCA6] hover:shadow-lg"
              style={{
                boxShadow: '0 2px 8px -2px rgba(0, 0, 0, 0.06)'
              }}
            >
              {/* Checkerboard pattern for transparency indication */}
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: `
                    linear-gradient(45deg, #000 25%, transparent 25%),
                    linear-gradient(-45deg, #000 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #000 75%),
                    linear-gradient(-45deg, transparent 75%, #000 75%)
                  `,
                  backgroundSize: '8px 8px',
                  backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px'
                }}
              />

              {displayUrl ? (
                <>
                  <img
                    src={displayUrl}
                    alt="Organization logo"
                    className="relative z-10 object-contain max-h-[90%] max-w-[90%] transition-transform duration-300 group-hover:scale-[1.02]"
                    onError={(e) => {
                      e.currentTarget.style.display = "none"
                    }}
                  />
                  {currentLogoUrl && !selectedFile && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      className="absolute top-2 right-2 z-20 h-6 w-6 rounded-full bg-white/90 backdrop-blur-sm text-gray-400 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center hover:bg-[#FF6C5E] hover:text-white shadow-sm"
                      title="Remove logo"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <ImageIcon className="h-8 w-8 text-gray-300 group-hover:text-[#90FCA6] transition-colors duration-200" />
                  <span className="text-[10px] text-gray-400 font-medium">No logo</span>
                </div>
              )}
            </div>

            {/* Refined Guidelines */}
            <div className="mt-4 space-y-1.5">
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                Guidelines
              </p>
              <div className="space-y-1">
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-[#90FCA6]" />
                  200×200 px square
                </p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-[#90FCA6]" />
                  PNG with transparency
                </p>
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-[#90FCA6]" />
                  Max 1MB file size
                </p>
              </div>
            </div>
          </div>

          {/* Upload Options Section */}
          <div className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-5 bg-gray-50/80 p-1 rounded-lg">
                <TabsTrigger
                  value="upload"
                  className="text-sm font-medium rounded-md transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload
                </TabsTrigger>
                <TabsTrigger
                  value="url"
                  className="text-sm font-medium rounded-md transition-all duration-200 data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm data-[state=inactive]:text-gray-500 data-[state=inactive]:hover:text-gray-700"
                >
                  <LinkIcon className="h-4 w-4 mr-2" />
                  URL
                </TabsTrigger>
              </TabsList>

              {/* Upload Tab */}
              <TabsContent value="upload" className="space-y-4 mt-0">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  aria-hidden="true"
                />

                {selectedFile ? (
                  <div
                    className="flex items-center justify-between p-4 bg-[#90FCA6]/5 border border-[#90FCA6]/20 rounded-xl"
                    style={{
                      boxShadow: '0 1px 3px -1px rgba(144, 252, 166, 0.15)'
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-[#90FCA6]/10 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-5 w-5 text-[#1a7a3a]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCancelSelection}
                      className="h-8 w-8 rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-[#FF6C5E] hover:border-[#FF6C5E]/30 transition-all duration-200 flex items-center justify-center"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    className={`
                      relative rounded-xl p-8 text-center transition-all duration-300 cursor-pointer
                      ${isDragging
                        ? "bg-[#90FCA6]/5 border-2 border-[#90FCA6] shadow-[0_0_0_4px_rgba(144,252,166,0.1)]"
                        : "bg-gray-50/50 border-2 border-dashed border-gray-200 hover:border-[#90FCA6] hover:bg-[#90FCA6]/[0.02]"
                      }
                    `}
                    onClick={triggerFileInput}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div
                        className={`h-12 w-12 rounded-xl flex items-center justify-center transition-all duration-300 ${
                          isDragging
                            ? "bg-[#90FCA6]/20 text-[#1a7a3a]"
                            : "bg-white border border-gray-200 text-gray-400 shadow-sm"
                        }`}
                      >
                        <Upload className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">
                          <span className="text-[#1a7a3a] font-semibold hover:underline">Click to upload</span>
                          <span className="text-gray-400"> or drag and drop</span>
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          PNG, JPG, GIF, SVG, WebP up to 1MB
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedFile && (
                  <Button
                    type="button"
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="w-full h-11 bg-[#90FCA6] hover:bg-[#7aec90] text-gray-900 font-semibold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload Logo
                      </>
                    )}
                  </Button>
                )}
              </TabsContent>

              {/* URL Tab */}
              <TabsContent value="url" className="space-y-4 mt-0">
                <div className="space-y-2">
                  <Input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="h-11 px-4 text-sm bg-white border-gray-200 rounded-xl focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20 transition-all duration-200"
                  />
                  <p className="text-xs text-gray-400 pl-1">
                    Direct HTTPS link to your logo image
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    type="button"
                    onClick={handleSaveUrl}
                    disabled={isSavingUrl || urlInput === (currentLogoUrl || "")}
                    className="flex-1 h-11 bg-[#90FCA6] hover:bg-[#7aec90] text-gray-900 font-semibold rounded-xl transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-50"
                  >
                    {isSavingUrl ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save URL
                      </>
                    )}
                  </Button>

                  {currentLogoUrl && (
                    <Button
                      type="button"
                      onClick={handleDelete}
                      disabled={isDeleting}
                      variant="outline"
                      className="h-11 px-4 border-gray-200 text-gray-500 hover:text-[#FF6C5E] hover:border-[#FF6C5E]/30 hover:bg-[#FF6C5E]/5 rounded-xl transition-all duration-200"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}
