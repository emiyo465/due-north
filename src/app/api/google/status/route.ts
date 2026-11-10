import { getGoogleToken } from "@/lib/server/google-token"

// GET → { signedIn, configured }. The export dialog asks this when it opens, so
// a click on Google Calendar knows right away whether to open the sign-in popup
// (popups have to open straight from the click).
export async function GET(request: Request) {
  const configured = Boolean(
    process.env.AUTH_SECRET && process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
  )
  const signedIn = configured && (await getGoogleToken(request)) !== null
  return Response.json({ configured, signedIn }, { headers: { "Cache-Control": "no-store" } })
}
