import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

const TOKEN_LIFETIME_MS = 60 * 24 * 7 * 60 * 1000  // 7 days in ms — must match backend
const REFRESH_THRESHOLD_MS = 5 * 60 * 1000           // refresh when < 5 min left

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        try {
          const res = await fetch(`${process.env.API_URL}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password,
            }),
          })
          if (!res.ok) return null
          const data = await res.json()

          // Extract refresh_token from Set-Cookie so NextAuth can use it server-side
          const setCookie = res.headers.get('set-cookie') || ''
          const match = setCookie.match(/refresh_token=([^;]+)/)
          const refreshToken = match ? decodeURIComponent(match[1]) : null

          // Fetch user profile
          const meRes = await fetch(`${process.env.API_URL}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${data.access_token}` },
          })
          if (!meRes.ok) return null
          const user = await meRes.json()

          return {
            ...user,
            accessToken: data.access_token,
            refreshToken,
            accessTokenExpiry: Date.now() + TOKEN_LIFETIME_MS,
          }
        } catch (_) {
          return null
        }
      },
    }),
  ],

  session: { strategy: 'jwt', maxAge: 7 * 24 * 60 * 60 },

  callbacks: {
    async jwt({ token, user, trigger, session: incoming }) {
      // Initial sign-in — populate from user object returned by authorize()
      if (user) {
        token.accessToken      = user.accessToken
        token.refreshToken     = user.refreshToken
        token.accessTokenExpiry = user.accessTokenExpiry
        token.id    = user.id
        token.name  = user.name
        token.email = user.email
        token.theme = user.theme
      }

      // updateSession() calls land here
      if (trigger === 'update' && incoming) {
        if (incoming.theme != null) token.theme = incoming.theme
        if (incoming.name  != null) token.name  = incoming.name
        if (incoming.email != null) token.email = incoming.email
      }

      // Auto-refresh access token before it expires
      const expiry = token.accessTokenExpiry
      if (expiry && Date.now() > expiry - REFRESH_THRESHOLD_MS && token.refreshToken) {
        try {
          const res = await fetch(`${process.env.API_URL}/api/v1/auth/refresh-token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: token.refreshToken }),
          })
          if (res.ok) {
            const data = await res.json()
            token.accessToken       = data.access_token
            token.accessTokenExpiry = Date.now() + TOKEN_LIFETIME_MS
          }
        } catch (_) {
          // If refresh fails, leave the existing token — it may still be valid
        }
      }

      return token
    },

    async session({ session, token }) {
      session.accessToken = token.accessToken
      session.user.id     = token.id
      session.user.theme  = token.theme
      return session
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  secret: process.env.NEXTAUTH_SECRET,
}

export default NextAuth(authOptions)
