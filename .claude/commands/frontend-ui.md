# /frontend-ui - Premium Console UI Guidelines

Build stunning, premium CloudAct console interfaces with shiny white surfaces and creative user experiences.

## Usage

```
/frontend-ui                    # Show full design guidelines
/frontend-ui page               # Create a new console page
/frontend-ui form               # Create a premium form layout
/frontend-ui card               # Create metric/feature cards
/frontend-ui banner             # Create status/alert banners
/frontend-ui fix <component>    # Improve existing component
```

---

## DESIGN PHILOSOPHY

**Apple Health / Fitness+ Premium Pattern**
- Stunning shiny white surfaces with subtle depth
- Bounded content (max-w-7xl = 1280px), never full-bleed stretch
- Generous breathing room and whitespace
- Subtle shadows that create floating card effect
- Hover states that feel responsive and alive
- Creative micro-interactions that delight users

---

## COLOR RULES (CRITICAL)

### Primary Palette
```
Surface:      #FFFFFF (Pure white - primary background)
Surface Alt:  #FAFAFA (Off-white for depth layers)
Text Primary: #1C1C1E (Slate black - all body text)
Text Secondary: #6B7280 (Gray-500 - labels, captions)
Text Muted:   #9CA3AF (Gray-400 - placeholders, hints)
Border:       rgba(0,0,0,0.06) - Subtle dividers
Border Hover: rgba(0,0,0,0.12) - Interactive elements
```

### Accent Colors (Use Sparingly)
```
Mint:         #90FCA6 → BUTTONS ONLY, NEVER for text
Mint Hover:   #6EE890 → Button hover state
Coral:        #FF6C5E → Destructive actions, warnings
Obsidian:     #0a0a0b → Auth flows only (not console)
Success:      #10B981 → Success indicators (emerald, NOT mint)
Info:         #3B82F6 → Information icons (charts only)
```

### TEXT COLOR RULES
| Context | Color | Class |
|---------|-------|-------|
| Headings | #1C1C1E | `text-gray-900` |
| Body text | #1C1C1E | `text-gray-900` |
| Labels | #6B7280 | `text-gray-500` |
| Captions | #9CA3AF | `text-gray-400` |
| Links | #1C1C1E underline | `text-gray-900 underline` |
| Success text | #059669 | `text-emerald-600` |
| Error text | #DC2626 | `text-red-600` |
| Warning text | #D97706 | `text-amber-600` |

**NEVER USE MINT (#90FCA6) FOR TEXT** - It has poor contrast on white backgrounds.

---

## BUTTON SYSTEM (Keep These!)

### Primary Button (Console CTAs)
```tsx
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] active:bg-[#5DD97F] rounded-lg px-4 py-2.5 font-medium shadow-sm hover:shadow-md transition-all duration-200">
  Save Changes
</button>
```

### Large Primary Button (Hero CTAs)
```tsx
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] active:bg-[#5DD97F] rounded-xl px-6 py-3.5 font-semibold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
  Get Started
</button>
```

### Secondary Button
```tsx
<button className="bg-white text-gray-900 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded-lg px-4 py-2.5 font-medium transition-all duration-200">
  Cancel
</button>
```

### Ghost Button
```tsx
<button className="bg-transparent text-gray-700 hover:bg-gray-100 rounded-lg px-4 py-2.5 font-medium transition-all duration-200">
  Learn More
</button>
```

### Destructive Button
```tsx
<button className="bg-[#FF6C5E] text-white hover:bg-[#e85a4d] active:bg-[#d94d3f] rounded-lg px-4 py-2.5 font-medium shadow-sm transition-all duration-200">
  Delete
</button>
```

### Icon Button
```tsx
<button className="p-2.5 rounded-lg bg-white border border-gray-200 hover:border-[#90FCA6] hover:shadow-md text-gray-600 hover:text-gray-900 transition-all duration-200">
  <Icon className="w-5 h-5" />
</button>
```

---

## PAGE STRUCTURE

### Console Page Template
```tsx
export default function ConsolePage() {
  return (
    <div className="min-h-full bg-white">
      {/* Subtle top gradient glow */}
      <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#90FCA6]/5 via-[#90FCA6]/2 to-transparent pointer-events-none" />

      {/* Status Banners (if needed) */}
      <OnboardingBanner />
      <BillingAlertBanner />

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
        {/* Page Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Page Title
          </h1>
          <p className="mt-1 text-gray-500">
            Brief description of what this page does
          </p>
        </div>

        {/* Page Content */}
        <div className="space-y-6 sm:space-y-8">
          {/* Content sections */}
        </div>
      </div>
    </div>
  );
}
```

---

## PREMIUM CARDS

### Metric Card (with shine effect)
```tsx
<div className="group relative bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 overflow-hidden">
  {/* Shine effect on hover */}
  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />

  <div className="relative">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-medium text-gray-500">Total Spend</span>
      <div className="p-2 rounded-lg bg-gray-50 group-hover:bg-[#90FCA6]/10 transition-colors">
        <DollarSign className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
      </div>
    </div>
    <p className="text-3xl font-bold text-gray-900 tracking-tight">$24,580</p>
    <p className="mt-1 text-sm text-emerald-600 font-medium">+12.5% from last month</p>
  </div>
</div>
```

### Feature Card (Clickable)
```tsx
<button className="group w-full text-left bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:border-[#90FCA6]/30 hover:-translate-y-1 transition-all duration-300">
  <div className="flex items-start gap-4">
    <div className="p-3 rounded-xl bg-gray-50 group-hover:bg-[#90FCA6]/10 transition-colors">
      <Cloud className="w-6 h-6 text-gray-600 group-hover:text-gray-900" />
    </div>
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-gray-900 group-hover:text-gray-900">
        Cloud Providers
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Connect AWS, GCP, or Azure accounts
      </p>
    </div>
    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#90FCA6] group-hover:translate-x-1 transition-all" />
  </div>
</button>
```

### Content Card (with sections)
```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
  {/* Card Header */}
  <div className="px-5 sm:px-6 py-4 border-b border-gray-100 bg-gray-50/50">
    <h2 className="font-semibold text-gray-900">Section Title</h2>
  </div>

  {/* Card Body */}
  <div className="p-5 sm:p-6">
    {/* Content */}
  </div>

  {/* Card Footer (optional) */}
  <div className="px-5 sm:px-6 py-4 border-t border-gray-100 bg-gray-50/30 flex items-center justify-end gap-3">
    <button className="...">Cancel</button>
    <button className="bg-[#90FCA6] text-black ...">Save</button>
  </div>
</div>
```

---

## FORM LAYOUTS (Fixed - Not Squeezy!)

### Premium Form Container
```tsx
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
  <div className="px-6 sm:px-8 py-5 border-b border-gray-100">
    <h2 className="text-xl font-semibold text-gray-900">Add Subscription Plan</h2>
    <p className="mt-1 text-sm text-gray-500">Configure your SaaS subscription details</p>
  </div>

  <div className="px-6 sm:px-8 py-6 sm:py-8">
    <div className="max-w-2xl space-y-6">
      {/* Form fields - generous spacing! */}
    </div>
  </div>
</div>
```

### Form Field (Spacious)
```tsx
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    Plan Name
    <span className="text-red-500 ml-0.5">*</span>
  </label>
  <input
    type="text"
    className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white
               focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20
               placeholder:text-gray-400 text-gray-900
               transition-all duration-200"
    placeholder="e.g., Slack Pro"
  />
  <p className="text-xs text-gray-400">Enter the name of your subscription plan</p>
</div>
```

### Select Dropdown (Spacious)
```tsx
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    Hierarchy Level
  </label>
  <select className="w-full h-12 px-4 rounded-xl border border-gray-200 bg-white
                     focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20
                     text-gray-900 appearance-none cursor-pointer
                     transition-all duration-200">
    <option value="">Select a department, project, or team...</option>
  </select>
</div>
```

### Form Grid (2-Column for Desktop)
```tsx
<div className="grid gap-6 sm:grid-cols-2">
  <div className="space-y-2">
    <label>Monthly Cost</label>
    <input ... />
  </div>
  <div className="space-y-2">
    <label>Currency</label>
    <select ... />
  </div>
</div>
```

### Hierarchy Selector (NOT Squeezy!)
```tsx
<div className="space-y-2">
  <label className="block text-sm font-medium text-gray-700">
    Cost Allocation
  </label>
  <div className="relative">
    <select className="w-full h-14 px-4 pr-10 rounded-xl border border-gray-200 bg-white
                       focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20
                       text-gray-900 appearance-none cursor-pointer text-base">
      <option value="">Select where to allocate this cost...</option>
      <optgroup label="Departments">
        <option value="DEPT-ENG">Engineering Department</option>
      </optgroup>
      <optgroup label="Projects">
        <option value="PROJ-PLATFORM">└─ Platform Project</option>
      </optgroup>
      <optgroup label="Teams">
        <option value="TEAM-BACKEND">    └─ Backend Team</option>
      </optgroup>
    </select>
    <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
  </div>
  <p className="text-xs text-gray-400">
    Assign this subscription to a department, project, or team for cost tracking
  </p>
</div>
```

---

## STATUS BANNERS (Smart Alerts)

### Onboarding Issues Banner
```tsx
{!isBackendOnboarded && (
  <div className="bg-amber-50 border-b border-amber-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">
              Backend setup incomplete
            </p>
            <p className="text-xs text-amber-600">
              Some features are limited until setup is complete
            </p>
          </div>
        </div>
        <button className="shrink-0 px-4 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-medium hover:bg-amber-200 transition-colors">
          Complete Setup
        </button>
      </div>
    </div>
  </div>
)}
```

### Billing Alert Banner
```tsx
{billingIssue && (
  <div className="bg-red-50 border-b border-red-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-red-100">
            <CreditCard className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-red-800">
              Payment issue detected
            </p>
            <p className="text-xs text-red-600">
              Please update your payment method to continue using all features
            </p>
          </div>
        </div>
        <button className="shrink-0 px-4 py-2 rounded-lg bg-red-100 text-red-800 text-sm font-medium hover:bg-red-200 transition-colors">
          Update Payment
        </button>
      </div>
    </div>
  </div>
)}
```

### Success Banner (Dismissible)
```tsx
{showSuccess && (
  <div className="bg-emerald-50 border-b border-emerald-200">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-full bg-emerald-100">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-sm font-medium text-emerald-800">
            Changes saved successfully
          </p>
        </div>
        <button onClick={() => setShowSuccess(false)} className="p-1 rounded hover:bg-emerald-100">
          <X className="w-4 h-4 text-emerald-600" />
        </button>
      </div>
    </div>
  </div>
)}
```

---

## CREATIVE USER EXPERIENCES

### Empty State (Engaging)
```tsx
<div className="text-center py-16 px-6">
  <div className="mx-auto w-20 h-20 rounded-2xl bg-gradient-to-br from-[#90FCA6]/20 to-[#90FCA6]/5 flex items-center justify-center mb-6">
    <Inbox className="w-10 h-10 text-gray-400" />
  </div>
  <h3 className="text-xl font-semibold text-gray-900 mb-2">
    No subscriptions yet
  </h3>
  <p className="text-gray-500 max-w-sm mx-auto mb-8">
    Track your SaaS spending by adding your first subscription. We'll help you visualize costs across your organization.
  </p>
  <button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] rounded-xl px-6 py-3 font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
    <Plus className="w-5 h-5 inline mr-2" />
    Add Your First Subscription
  </button>
</div>
```

### Loading State (Premium Skeleton)
```tsx
<div className="animate-pulse space-y-4">
  <div className="h-8 bg-gray-100 rounded-lg w-1/3" />
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="h-32 bg-gray-100 rounded-2xl" />
    ))}
  </div>
  <div className="h-64 bg-gray-100 rounded-2xl" />
</div>
```

### Interactive List Item
```tsx
<div className="group flex items-center gap-4 p-4 rounded-xl bg-white border border-gray-100 hover:border-[#90FCA6]/30 hover:shadow-md transition-all duration-200 cursor-pointer">
  <div className="w-12 h-12 rounded-xl bg-gray-100 group-hover:bg-[#90FCA6]/10 flex items-center justify-center transition-colors">
    <img src={logo} alt="" className="w-8 h-8" />
  </div>
  <div className="flex-1 min-w-0">
    <h4 className="font-medium text-gray-900 truncate">Slack Pro</h4>
    <p className="text-sm text-gray-500">$12.50/user/month • 45 seats</p>
  </div>
  <div className="text-right">
    <p className="font-semibold text-gray-900">$562.50</p>
    <p className="text-xs text-gray-400">per month</p>
  </div>
  <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-[#90FCA6] group-hover:translate-x-1 transition-all" />
</div>
```

### Progress Indicator (Onboarding)
```tsx
<div className="flex items-center gap-2 mb-8">
  {steps.map((step, i) => (
    <React.Fragment key={i}>
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm transition-all
        ${i < currentStep ? 'bg-[#90FCA6] text-black' : ''}
        ${i === currentStep ? 'bg-gray-900 text-white ring-4 ring-gray-900/10' : ''}
        ${i > currentStep ? 'bg-gray-100 text-gray-400' : ''}
      `}>
        {i < currentStep ? <Check className="w-5 h-5" /> : i + 1}
      </div>
      {i < steps.length - 1 && (
        <div className={`flex-1 h-1 rounded-full transition-colors ${i < currentStep ? 'bg-[#90FCA6]' : 'bg-gray-100'}`} />
      )}
    </React.Fragment>
  ))}
</div>
```

---

## SPACING & LAYOUT REFERENCE

### Container Widths
| Class | Width | Usage |
|-------|-------|-------|
| `max-w-7xl` | 1280px | Console pages (standard) |
| `max-w-4xl` | 896px | Settings pages |
| `max-w-3xl` | 768px | Forms, focused content |
| `max-w-2xl` | 672px | Modals, dialogs |
| `max-w-xl` | 576px | Small dialogs |

### Spacing Scale (8px Grid)
```
space-1:  4px   (tight: icon gaps)
space-2:  8px   (inline elements)
space-3:  12px  (list items)
space-4:  16px  (standard gaps)
space-5:  20px  (card padding mobile)
space-6:  24px  (card padding desktop)
space-8:  32px  (section margins)
space-10: 40px  (large gaps)
space-12: 48px  (page sections)
```

### Responsive Patterns
```tsx
// Spacing
className="space-y-4 sm:space-y-6 lg:space-y-8"
className="gap-4 sm:gap-6"
className="p-4 sm:p-6 lg:p-8"

// Grid
className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"

// Typography
className="text-xl sm:text-2xl lg:text-3xl"
```

---

## DO's

| Category | Guideline |
|----------|-----------|
| **Surfaces** | Use pure white (#FFFFFF) for cards and backgrounds |
| **Surfaces** | Add subtle gradient glow at page top |
| **Text** | Use gray-900 for headings, gray-500 for labels |
| **Text** | NEVER use mint for text - poor contrast! |
| **Buttons** | Use mint #90FCA6 with black text |
| **Buttons** | Add hover lift (-translate-y) for premium feel |
| **Cards** | Use rounded-2xl for modern look |
| **Cards** | Add shine/glow effects on hover |
| **Forms** | Make inputs h-12 minimum (48px touch target) |
| **Forms** | Use generous spacing (space-y-6) between fields |
| **Hierarchy** | Use h-14 for hierarchy selects (not squeezy) |
| **Banners** | Show issues at top, don't redirect away |
| **Empty States** | Make them engaging with CTAs |
| **Loading** | Use premium skeleton animations |

## DON'Ts

| Category | Avoid |
|----------|-------|
| **Colors** | Mint text on white (poor contrast) |
| **Colors** | Blue for links (use gray-900 + underline) |
| **Colors** | Gray backgrounds on console pages |
| **Layout** | Full-width stretching (always bound content) |
| **Layout** | Cramped/squeezy forms |
| **Forms** | Small inputs (< 44px height) |
| **Forms** | Missing helper text and labels |
| **Spacing** | Inconsistent gaps (stick to 8px grid) |
| **Redirects** | Redirecting users for backend issues |
| **Shadows** | Heavy drop shadows |
| **Animation** | Jarring/fast transitions |

---

## QUICK COPY-PASTE

### Page Container
```tsx
<div className="min-h-full bg-white">
  <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-[#90FCA6]/5 to-transparent pointer-events-none" />
  <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
```

### Premium Card
```tsx
<div className="bg-white rounded-2xl p-5 sm:p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
```

### Primary Button
```tsx
<button className="bg-[#90FCA6] text-black hover:bg-[#6EE890] rounded-lg px-4 py-2.5 font-medium shadow-sm hover:shadow-md transition-all duration-200">
```

### Form Input
```tsx
<input className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20 text-gray-900 placeholder:text-gray-400 transition-all" />
```

### Hierarchy Select
```tsx
<select className="w-full h-14 px-4 rounded-xl border border-gray-200 focus:border-[#90FCA6] focus:ring-2 focus:ring-[#90FCA6]/20 text-gray-900 appearance-none cursor-pointer text-base">
```

---

*CloudAct Premium UI v1.0 | Stunning white surfaces | Creative user experiences*
