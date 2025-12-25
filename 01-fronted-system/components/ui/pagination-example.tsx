"use client"

/**
 * Pagination Component Examples
 *
 * This file demonstrates how to use the Pagination component with the CloudAct brand colors:
 * - Active page: Mint #90FCA6 background with black text
 * - Hover state: Light Mint #F0FFF4 background
 * - Disabled state: Gray styling
 * - Touch targets: Minimum 44px for accessibility
 */

import { useState } from "react"
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

export function PaginationDemo() {
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 10

  return (
    <div className="space-y-8 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Basic Pagination</CardTitle>
          <CardDescription>Simple pagination with previous/next buttons</CardDescription>
        </CardHeader>
        <CardContent>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  size="icon"
                  disabled={currentPage === 1}
                  onClick={(e) => {
                    e.preventDefault()
                    if (currentPage > 1) setCurrentPage(currentPage - 1)
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive size="icon">
                  {currentPage}
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  size="icon"
                  disabled={currentPage === totalPages}
                  onClick={(e) => {
                    e.preventDefault()
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1)
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Full Pagination with Page Numbers</CardTitle>
          <CardDescription>Complete pagination with numbered pages and ellipsis</CardDescription>
        </CardHeader>
        <CardContent>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  size="icon"
                  disabled={currentPage === 1}
                  onClick={(e) => {
                    e.preventDefault()
                    if (currentPage > 1) setCurrentPage(currentPage - 1)
                  }}
                />
              </PaginationItem>

              {/* First page */}
              <PaginationItem>
                <PaginationLink
                  href="#"
                  isActive={currentPage === 1}
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault()
                    setCurrentPage(1)
                  }}
                >
                  1
                </PaginationLink>
              </PaginationItem>

              {/* Ellipsis if needed */}
              {currentPage > 3 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              {/* Previous page */}
              {currentPage > 2 && currentPage < totalPages && (
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault()
                      setCurrentPage(currentPage - 1)
                    }}
                  >
                    {currentPage - 1}
                  </PaginationLink>
                </PaginationItem>
              )}

              {/* Current page */}
              {currentPage !== 1 && currentPage !== totalPages && (
                <PaginationItem>
                  <PaginationLink href="#" isActive size="icon">
                    {currentPage}
                  </PaginationLink>
                </PaginationItem>
              )}

              {/* Next page */}
              {currentPage < totalPages - 1 && currentPage > 1 && (
                <PaginationItem>
                  <PaginationLink
                    href="#"
                    size="icon"
                    onClick={(e) => {
                      e.preventDefault()
                      setCurrentPage(currentPage + 1)
                    }}
                  >
                    {currentPage + 1}
                  </PaginationLink>
                </PaginationItem>
              )}

              {/* Ellipsis if needed */}
              {currentPage < totalPages - 2 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}

              {/* Last page */}
              <PaginationItem>
                <PaginationLink
                  href="#"
                  isActive={currentPage === totalPages}
                  size="icon"
                  onClick={(e) => {
                    e.preventDefault()
                    setCurrentPage(totalPages)
                  }}
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>

              <PaginationItem>
                <PaginationNext
                  href="#"
                  size="icon"
                  disabled={currentPage === totalPages}
                  onClick={(e) => {
                    e.preventDefault()
                    if (currentPage < totalPages) setCurrentPage(currentPage + 1)
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disabled States</CardTitle>
          <CardDescription>Shows how disabled states appear</CardDescription>
        </CardHeader>
        <CardContent>
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious href="#" size="icon" disabled />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" isActive size="icon">
                  1
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" disabled size="icon">
                  2
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationEllipsis />
              </PaginationItem>
              <PaginationItem>
                <PaginationLink href="#" disabled size="icon">
                  10
                </PaginationLink>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext href="#" size="icon" disabled />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current State</CardTitle>
          <CardDescription>Page {currentPage} of {totalPages}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}

/**
 * Helper function to generate pagination logic
 * Returns array of page numbers to display with ellipsis indicators
 */
export function generatePaginationPages(
  currentPage: number,
  totalPages: number,
  maxVisible: number = 5
): (number | "ellipsis")[] {
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | "ellipsis")[] = []
  const halfVisible = Math.floor(maxVisible / 2)

  // Always show first page
  pages.push(1)

  if (currentPage <= halfVisible + 1) {
    // Near the beginning
    for (let i = 2; i < maxVisible; i++) {
      pages.push(i)
    }
    pages.push("ellipsis")
    pages.push(totalPages)
  } else if (currentPage >= totalPages - halfVisible) {
    // Near the end
    pages.push("ellipsis")
    for (let i = totalPages - maxVisible + 2; i <= totalPages; i++) {
      pages.push(i)
    }
  } else {
    // In the middle
    pages.push("ellipsis")
    for (let i = currentPage - halfVisible + 1; i <= currentPage + halfVisible - 1; i++) {
      pages.push(i)
    }
    pages.push("ellipsis")
    pages.push(totalPages)
  }

  return pages
}
