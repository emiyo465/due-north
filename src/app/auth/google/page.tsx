"use client"

import { useEffect } from "react"
import { signIn } from "next-auth/react"

// Opened in a popup by signInWithGoogle(), so the planner's in-memory work
// stays put in the main window while the user signs in.
export default function GoogleSignInPage() {
  useEffect(() => {
    void signIn("google", { redirectTo: "/auth/done" })
  }, [])

  return (
    <main className="flex flex-1 items-center justify-center p-6 text-muted-foreground">
      Opening Google sign-in…
    </main>
  )
}
