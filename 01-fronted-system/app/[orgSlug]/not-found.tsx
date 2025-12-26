"use client"

import Link from "next/link"
import { Home, ArrowLeft, Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function OrgNotFound() {
  return (
    <div className="container mx-auto py-10 max-w-2xl">
      <div className="text-center space-y-6">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-[#FF6C5E]/10 flex items-center justify-center">
            <Search className="h-8 w-8 text-[#FF6C5E]" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-[#FF6C5E]">404</h1>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Page not found</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            The page you are looking for does not exist in this organization or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button asChild className="bg-[#90FCA6] hover:bg-[#6EE890] text-black">
            <Link href="/">
              <Home className="h-4 w-4 mr-2" />
              Go to dashboard
            </Link>
          </Button>
          <Button asChild variant="outline">
            <button onClick={() => window.history.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Go back
            </button>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground pt-4">
          Need help? Contact{" "}
          <a
            href={`mailto:${process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@cloudact.ai"}`}
            className="text-slate-900 hover:underline font-medium"
          >
            support
          </a>
        </p>
      </div>
    </div>
  )
}
