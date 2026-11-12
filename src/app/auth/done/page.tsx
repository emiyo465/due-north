"use client"

import { useEffect } from "react"
import { AUTH_CHANNEL, type AuthMessage } from "@/lib/google-auth"

// Where the sign-in popup lands, after success or an error (Auth.js adds ?error=).
// It reports back over a BroadcastChannel: Google's pages can cut the popup's
// link to window.opener, so postMessage to the opener isn't reliable. The
// planner window shows what happened, so this page only needs to close.
export default function SignInDonePage() {
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("error")
    const message: AuthMessage = code ? { ok: false, error: code } : { ok: true }
    const channel = new BroadcastChannel(AUTH_CHANNEL)
    channel.postMessage(message)
    channel.close()
    window.close()
  }, [])

  return (
    <main className="flex flex-1 items-center justify-center p-6 text-center text-muted-foreground">
      You can close this window and return to Due North.
    </main>
  )
}
