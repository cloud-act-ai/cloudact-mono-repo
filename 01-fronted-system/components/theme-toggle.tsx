"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Monitor, Sun, Moon } from "lucide-react"
import { cn } from "@/lib/utils"

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div className={cn(
        "flex items-center rounded-lg p-0.5",
        "bg-slate-100 dark:bg-slate-800",
        compact ? "gap-0" : "gap-0.5"
      )}>
        {[0, 1, 2].map(i => (
          <div key={i} className={cn("h-7 w-7 rounded-md", compact && "h-6 w-6")} />
        ))}
      </div>
    )
  }

  const modes = [
    { key: "system", icon: Monitor, label: "System" },
    { key: "light", icon: Sun, label: "Light" },
    { key: "dark", icon: Moon, label: "Dark" },
  ] as const

  const activeIndex = modes.findIndex(m => m.key === theme)

  return (
    <div
      className={cn(
        "relative flex items-center rounded-lg p-0.5",
        "bg-slate-100 dark:bg-slate-800",
        compact ? "gap-0" : "gap-0.5"
      )}
      role="group"
      aria-label="Theme"
    >
      {/* Sliding indicator */}
      <div
        className={cn(
          "absolute top-0.5 rounded-md transition-transform duration-200 ease-out",
          "bg-white dark:bg-slate-700 shadow-sm",
          compact ? "h-6 w-6" : "h-7 w-7"
        )}
        style={{ transform: `translateX(${activeIndex * (compact ? 24 : 28 + 2)}px)` }}
      />

      {modes.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          onClick={() => setTheme(key)}
          className={cn(
            "relative z-10 flex items-center justify-center rounded-md transition-colors",
            compact ? "h-6 w-6" : "h-7 w-7",
            theme === key
              ? "text-slate-900 dark:text-slate-100"
              : "text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
          )}
          aria-label={`${label} theme`}
          title={label}
        >
          <Icon className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
        </button>
      ))}
    </div>
  )
}
