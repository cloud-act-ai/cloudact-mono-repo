"use client"

/**
 * Table with Pagination Example
 *
 * Demonstrates how to integrate pagination with tables using CloudAct design system.
 */

import { useState, useMemo } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

// Sample data
interface SubscriptionData {
  id: string
  provider: string
  plan: string
  cost: number
  status: "active" | "cancelled" | "pending"
}

const sampleData: SubscriptionData[] = Array.from({ length: 47 }, (_, i) => ({
  id: `sub-${i + 1}`,
  provider: ["Slack", "Notion", "Figma", "GitHub", "ChatGPT Plus"][i % 5],
  plan: ["Pro", "Business", "Enterprise", "Team"][i % 4],
  cost: [12.99, 29.99, 49.99, 99.99, 19.99][i % 5],
  status: (["active", "cancelled", "pending"] as const)[i % 3],
}))

export function TableWithPaginationExample() {
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Calculate pagination
  const totalPages = Math.ceil(sampleData.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = useMemo(
    () => sampleData.slice(startIndex, endIndex),
    [startIndex, endIndex]
  )

  // Generate page numbers with ellipsis logic
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    // Always show first page
    pages.push(1)

    if (currentPage <= 3) {
      // Near beginning
      for (let i = 2; i <= Math.min(4, totalPages - 1); i++) {
        pages.push(i)
      }
      if (totalPages > 4) pages.push("ellipsis")
    } else if (currentPage >= totalPages - 2) {
      // Near end
      pages.push("ellipsis")
      for (let i = Math.max(totalPages - 3, 2); i < totalPages; i++) {
        pages.push(i)
      }
    } else {
      // In middle
      pages.push("ellipsis")
      pages.push(currentPage - 1)
      pages.push(currentPage)
      pages.push(currentPage + 1)
      pages.push("ellipsis")
    }

    // Always show last page
    if (totalPages > 1) pages.push(totalPages)

    return pages
  }

  const pageNumbers = getPageNumbers()

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-[#007A78]/10 text-[#007A78] border-[#007A78]/30"
      case "cancelled":
        return "bg-gray-100 text-gray-700 border-gray-200"
      case "pending":
        return "bg-[#FF6E50]/10 text-[#FF6E50] border-[#FF6E50]/30"
      default:
        return "bg-gray-100 text-gray-700 border-gray-200"
    }
  }

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Subscription Plans</CardTitle>
          <CardDescription>
            Showing {startIndex + 1}-{Math.min(endIndex, sampleData.length)} of{" "}
            {sampleData.length} subscriptions
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentData.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-gray-500">
                    {item.id}
                  </TableCell>
                  <TableCell className="font-medium">{item.provider}</TableCell>
                  <TableCell>{item.plan}</TableCell>
                  <TableCell className="text-right font-semibold text-[#007A78]">
                    ${item.cost.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`capitalize ${getStatusColor(item.status)}`}
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-center">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                disabled={currentPage === 1}
                onClick={(e) => {
                  e.preventDefault()
                  if (currentPage > 1) setCurrentPage(currentPage - 1)
                }}
              />
            </PaginationItem>

            {pageNumbers.map((page, index) =>
              page === "ellipsis" ? (
                <PaginationItem key={`ellipsis-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={page}>
                  <PaginationLink
                    href="#"
                    size="icon"
                    isActive={currentPage === page}
                    onClick={(e) => {
                      e.preventDefault()
                      setCurrentPage(page as number)
                    }}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              )
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                disabled={currentPage === totalPages}
                onClick={(e) => {
                  e.preventDefault()
                  if (currentPage < totalPages) setCurrentPage(currentPage + 1)
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      {/* Info footer */}
      <div className="text-center text-sm text-gray-500">
        Page {currentPage} of {totalPages}
      </div>
    </div>
  )
}

/**
 * Compact Pagination Variant (Mobile-friendly)
 */
export function CompactTablePagination() {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 10

  return (
    <Card className="p-4">
      <CardTitle className="text-sm mb-4">Compact Pagination (Mobile)</CardTitle>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              disabled={currentPage === 1}
              onClick={(e) => {
                e.preventDefault()
                if (currentPage > 1) setCurrentPage(currentPage - 1)
              }}
            />
          </PaginationItem>

          <PaginationItem>
            <span className="flex h-[44px] items-center px-4 text-sm text-gray-700">
              {currentPage} / {totalPages}
            </span>
          </PaginationItem>

          <PaginationItem>
            <PaginationNext
              href="#"
              disabled={currentPage === totalPages}
              onClick={(e) => {
                e.preventDefault()
                if (currentPage < totalPages) setCurrentPage(currentPage + 1)
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </Card>
  )
}

/**
 * Pagination with items per page selector
 */
export function TableWithItemsPerPage() {
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  const totalPages = Math.ceil(sampleData.length / itemsPerPage)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Advanced Pagination</CardTitle>
              <CardDescription>With items per page control</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="items-per-page" className="text-sm text-gray-600">
                Per page:
              </label>
              <select
                id="items-per-page"
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value))
                  setCurrentPage(1) // Reset to first page
                }}
                className="h-9 rounded-xl border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#007A78] focus:ring-offset-2"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href="#"
              disabled={currentPage === 1}
              onClick={(e) => {
                e.preventDefault()
                if (currentPage > 1) setCurrentPage(currentPage - 1)
              }}
            />
          </PaginationItem>

          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
            <PaginationItem key={page}>
              <PaginationLink
                href="#"
                size="icon"
                isActive={currentPage === page}
                onClick={(e) => {
                  e.preventDefault()
                  setCurrentPage(page)
                }}
              >
                {page}
              </PaginationLink>
            </PaginationItem>
          ))}

          {totalPages > 5 && (
            <>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" size="icon">{totalPages}</PaginationLink>
              </PaginationItem>
            </>
          )}

          <PaginationItem>
            <PaginationNext
              href="#"
              disabled={currentPage === totalPages}
              onClick={(e) => {
                e.preventDefault()
                if (currentPage < totalPages) setCurrentPage(currentPage + 1)
              }}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
