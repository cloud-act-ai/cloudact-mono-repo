"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function BillingPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-slate-900">Billing & Subscription</h1>
          <p className="text-[15px] text-slate-500 mt-1">Manage your plan and payment methods</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Billing management is coming soon.</p>
        </CardContent>
      </Card>
    </div>
  )
}
