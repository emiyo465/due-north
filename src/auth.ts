import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

// Sign-in is only for Google Calendar export. The narrow scope lets the app make
// its own calendars and write to them, but not read the student's other ones.
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: { params: { scope: `openid email profile ${CALENDAR_SCOPE}` } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { error: "/auth/done" },
  callbacks: {
    // The access token stays in the encrypted session cookie and is read on the
    // server only (see getGoogleToken); the client session never includes it.
    jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
        token.expiresAt = account.expires_at
        token.scope = account.scope
      }
      return token
    },
  },
})
