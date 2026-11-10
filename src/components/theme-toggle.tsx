"use client"

import { Moon, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { THEME_KEY } from "@/lib/theme"

/** Switches between light and dark. The app follows the system setting until it's used. */
export function ThemeToggle({ className }: { className?: string }) {
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark")
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light")
    } catch {
      // Private browsing can block storage; the switch still works for this visit.
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      aria-label="Toggle dark mode"
      onClick={toggle}
    >
      {/* CSS picks the icon, so the server render can't mismatch the theme. */}
      <Moon className="dark:hidden" aria-hidden />
      <Sun className="hidden dark:block" aria-hidden />
    </Button>
  )
}
