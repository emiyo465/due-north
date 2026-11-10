import { getToken } from "next-auth/jwt"
import { CALENDAR_SCOPE } from "@/auth"

/** The signed-in user's Google access token, if it's still good for calendar writes. */
export async function getGoogleToken(request: Request) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    // Over https Auth.js uses the __Secure- cookie name.
    secureCookie: new URL(request.url).protocol === "https:",
  })
  const accessToken = typeof token?.accessToken === "string" ? token.accessToken : null
  const expiresAt = typeof token?.expiresAt === "number" ? token.expiresAt : 0
  const scope = typeof token?.scope === "string" ? token.scope : ""
  // Leave a minute's margin so the token doesn't expire partway through.
  if (!accessToken || expiresAt * 1000 < Date.now() + 60_000) return null
  if (!scope.split(" ").includes(CALENDAR_SCOPE)) return null
  return accessToken
}
