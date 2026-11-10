export const AUTH_CHANNEL = "google-sign-in"

export type AuthMessage = { ok: true } | { ok: false; error: string }

export class SignInError extends Error {
  constructor(
    message: string,
    readonly reason: "blocked" | "failed" | "timeout" | "cancelled"
  ) {
    super(message)
  }
}

// Long enough to pick an account and read the consent screen.
const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Signs in with Google in a popup, so the planner's unsaved work isn't lost to a
 * redirect. Call it straight from a click handler, or the browser blocks the popup.
 * Google's pages can hide whether the popup was closed, so the caller offers a
 * Cancel that aborts `signal`.
 */
export function signInWithGoogle(signal?: AbortSignal): Promise<void> {
  const width = 500
  const height = 640
  const left = window.screenX + (window.outerWidth - width) / 2
  const top = window.screenY + (window.outerHeight - height) / 2
  const popup = window.open(
    "/auth/google",
    "google-sign-in",
    `popup,width=${width},height=${height},left=${left},top=${top}`
  )
  if (!popup) {
    return Promise.reject(new SignInError("The sign-in window was blocked.", "blocked"))
  }

  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(AUTH_CHANNEL)
    const timer = window.setTimeout(() => {
      finish()
      reject(new SignInError("Google sign-in timed out.", "timeout"))
    }, SIGN_IN_TIMEOUT_MS)

    function finish() {
      window.clearTimeout(timer)
      channel.close()
      signal?.removeEventListener("abort", onAbort)
    }

    function onAbort() {
      finish()
      reject(new SignInError("Google sign-in was cancelled.", "cancelled"))
    }
    signal?.addEventListener("abort", onAbort)

    channel.onmessage = ({ data }: MessageEvent<AuthMessage>) => {
      finish()
      if (data.ok) resolve()
      else reject(new SignInError("Google sign-in didn't finish.", "failed"))
    }
  })
}
