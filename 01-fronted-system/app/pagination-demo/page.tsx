/**
 * Pagination Demo Page
 *
 * Visit this page to see all pagination components and variants in action.
 * URL: http://localhost:3000/pagination-demo
 *
 * This page is for development/testing only and should be removed or protected in production.
 */

import { PaginationDemo } from "@/components/ui/pagination-example"
import {
  TableWithPaginationExample,
  CompactTablePagination,
  TableWithItemsPerPage,
} from "@/components/ui/table-with-pagination-example"

export default function PaginationDemoPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto py-12 space-y-12">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold text-gray-900">Pagination Components Demo</h1>
          <p className="text-lg text-gray-600">
            Interactive examples of pagination components with CloudAct brand styling.
          </p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <strong>Note:</strong> This page is for development/testing purposes. Remove or protect before deploying to production.
          </div>
        </div>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Basic Pagination Patterns</h2>
          <PaginationDemo />
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Table with Pagination</h2>
          <TableWithPaginationExample />
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Compact Pagination (Mobile)</h2>
          <CompactTablePagination />
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Advanced Pagination</h2>
          <TableWithItemsPerPage />
        </section>

        <section className="border-t pt-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Design Specifications</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg border">
              <h3 className="font-semibold text-lg mb-4">Brand Colors</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[#007A78]"></div>
                  <div>
                    <div className="font-medium">Active Page</div>
                    <div className="text-sm text-gray-500">#007A78</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-[#F0FDFA]"></div>
                  <div>
                    <div className="font-medium">Hover State</div>
                    <div className="text-sm text-gray-500">#F0FDFA</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-lg bg-gray-100 border border-gray-200"></div>
                  <div>
                    <div className="font-medium">Disabled</div>
                    <div className="text-sm text-gray-500">Gray</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg border">
              <h3 className="font-semibold text-lg mb-4">Accessibility</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Touch targets: 44px minimum</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Keyboard navigation supported</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Screen reader friendly (ARIA labels)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Focus indicators visible</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-green-600">✓</span>
                  <span>Color contrast compliant (WCAG AA)</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="bg-white p-6 rounded-lg border">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Reference</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h3 className="font-semibold mb-2">Touch Targets</h3>
              <p className="text-gray-600">All buttons: 44px × 44px minimum</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Spacing</h3>
              <p className="text-gray-600">Gap between items: 4px</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Border Radius</h3>
              <p className="text-gray-600">Rounded: 12px (rounded-xl)</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Icon Size</h3>
              <p className="text-gray-600">Chevrons: 16px (h-4 w-4)</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Font Weight</h3>
              <p className="text-gray-600">Semibold (600)</p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Focus Ring</h3>
              <p className="text-gray-600">2px with 2px offset</p>
            </div>
          </div>
        </section>

        <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h2 className="text-xl font-bold text-blue-900 mb-3">Usage Instructions</h2>
          <p className="text-blue-800 mb-4">
            Import the pagination components in your pages:
          </p>
          <pre className="bg-white rounded-lg p-4 overflow-x-auto text-sm border">
            <code>{`import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"`}</code>
          </pre>
          <p className="text-blue-800 mt-4">
            See <code className="bg-white px-2 py-1 rounded">components/ui/PAGINATION_README.md</code> for full documentation.
          </p>
        </section>
      </div>
    </div>
  )
}
