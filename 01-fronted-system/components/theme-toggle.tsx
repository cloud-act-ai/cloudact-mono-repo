"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Moon, Sun, Monitor } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return collapsed ? (
      <div className="flex justify-center py-2">
        <div className="h-8 w-8 rounded-lg bg-[var(--surface-secondary)] animate-pulse" />
      </div>
    ) : (
      <div className="px-4 py-2">
        <div className="h-8 rounded-lg bg-[var(--surface-secondary)] animate-pulse" />
      </div>
    )
  }

  const modes = [
    { value: "light", icon: Sun, label: "Light" },
    { value: "dark", icon: Moon, label: "Dark" },
    { value: "system", icon: Monitor, label: "System" },
  ] as const

  if (collapsed) {
    // Cycle through themes on click when sidebar is collapsed
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light"
    const CurrentIcon = theme === "dark" ? Moon : theme === "light" ? Sun : Monitor
    return (
      <div className="flex justify-center py-2">
        <button
          onClick={() => setTheme(next)}
          className={cn(
            "h-8 w-8 rounded-lg flex items-center justify-center",
            "text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]",
            "transition-all duration-200"
          )}
          title={`Theme: ${theme} (click to change)`}
          aria-label={`Current theme: ${theme}. Click to switch.`}
        >
          <CurrentIcon className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="px-4 py-2">
      <div className="flex items-center rounded-lg bg-[var(--surface-secondary)] p-0.5">
        {modes.map(({ value, icon: Icon, label }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium transition-all duration-200",
              theme === value
                ? "bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
            aria-label={`Switch to ${label} theme`}
            aria-pressed={theme === value}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
