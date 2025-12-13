/**
 * Separator Component Examples
 *
 * This file demonstrates the various uses of the Separator component
 * with all the fixes applied for brand consistency and accessibility.
 */

import { Separator } from '@/components/ui/separator'

export function SeparatorExamples() {
  return (
    <div className="space-y-8 p-8">
      {/* Example 1: Basic horizontal separator */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Basic Horizontal Separator</h3>
        <p className="text-sm text-gray-600">Light gray (rgba(0,0,0,0.06)) with default margins</p>
        <div className="my-4">
          <p>Content above</p>
          <Separator />
          <p>Content below</p>
        </div>
      </div>

      {/* Example 2: Labeled separator */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Labeled Separator</h3>
        <p className="text-sm text-gray-600">With centered text label</p>
        <div className="my-4">
          <p>Section one content</p>
          <Separator label="OR" />
          <p>Section two content</p>
        </div>
      </div>

      {/* Example 3: Custom labeled separator */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Custom Labeled Separator</h3>
        <p className="text-sm text-gray-600">With custom label styling</p>
        <div className="my-4">
          <p>Login with email</p>
          <Separator
            label="or continue with"
            labelClassName="text-xs uppercase tracking-wider text-gray-400"
          />
          <p>Social login options</p>
        </div>
      </div>

      {/* Example 4: Vertical separator */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Vertical Separator</h3>
        <p className="text-sm text-gray-600">For side-by-side content</p>
        <div className="flex items-center h-16">
          <div className="px-4">Left content</div>
          <Separator orientation="vertical" />
          <div className="px-4">Right content</div>
        </div>
      </div>

      {/* Example 5: Semantic separator (not decorative) */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Semantic Separator</h3>
        <p className="text-sm text-gray-600">For screen readers (decorative=false)</p>
        <div className="my-4">
          <section>
            <h4 className="font-medium">Section 1</h4>
            <p>First section content</p>
          </section>
          <Separator decorative={false} aria-label="End of section 1" />
          <section>
            <h4 className="font-medium">Section 2</h4>
            <p>Second section content</p>
          </section>
        </div>
      </div>

      {/* Example 6: Dark mode demonstration */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Dark Mode Support</h3>
        <p className="text-sm text-gray-600">Automatically adjusts to dark mode</p>
        <div className="dark bg-slate-900 p-4 rounded-lg">
          <p className="text-white">Dark mode content above</p>
          <Separator />
          <p className="text-white">Dark mode content below</p>
        </div>
      </div>

      {/* Example 7: Custom styling */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Custom Styled Separator</h3>
        <p className="text-sm text-gray-600">Override with custom classes</p>
        <div className="my-4">
          <p>Custom coral separator below</p>
          <Separator className="bg-[#FF6E50] h-[2px] my-6" />
          <p>Thicker and colored</p>
        </div>
      </div>

      {/* Example 8: No margins */}
      <div>
        <h3 className="text-lg font-semibold mb-2">No Margin Separator</h3>
        <p className="text-sm text-gray-600">Remove default margins</p>
        <div>
          <div className="bg-gray-100 p-4">
            <p>First card</p>
          </div>
          <Separator className="my-0" />
          <div className="bg-gray-100 p-4">
            <p>Second card</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Usage in forms (common pattern)
 */
export function FormSeparatorExample() {
  return (
    <form className="space-y-4 max-w-md">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Account Details</h3>
        <input
          type="email"
          placeholder="Email"
          className="w-full p-2 border rounded"
        />
        <input
          type="password"
          placeholder="Password"
          className="w-full p-2 border rounded"
        />
      </div>

      <Separator />

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Personal Information</h3>
        <input
          type="text"
          placeholder="Full Name"
          className="w-full p-2 border rounded"
        />
        <input
          type="tel"
          placeholder="Phone"
          className="w-full p-2 border rounded"
        />
      </div>
    </form>
  )
}
