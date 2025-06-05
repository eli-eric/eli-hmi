// lib/auth/auth-options.ts
import CredentialsProvider from 'next-auth/providers/credentials'
import jwt from 'jsonwebtoken'
import { ldapAuthenticate } from './ldap-auth'

import type { NextAuthOptions } from 'next-auth'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'Credentials',
      credentials: {
        username: {
          label: 'Username',
          type: 'text',
          placeholder: 'Enter your username',
        },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials.password) {
          return null
        }

        // Authenticate using LDAP (will use test user in dev mode)
        const user = await ldapAuthenticate(
          credentials.username,
          credentials.password,
        )

        if (user) {
          const token = jwt.sign(
            {
              username: user.username,
              exp: Math.floor(Date.now() / 1000) + 60 * 60 * 36, // 36 hours expiration
            },
            process.env.NEXTAUTH_SECRET || 'default',
          )

          console.log('Generated token for user:', user.username)

          return {
            id: user.username,
            name: user.username,
            email: user.username, // Assuming username is used as email
            accessToken: token, // Add accessToken directly to the User object
          }
        }

        // Return null if user data could not be retrieved
        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // If user is defined, it means this is the first time the JWT is created
      if (user) {
        token.id = user.id
        token.name = user.name
        token.email = user.email
        token.accessToken = user.accessToken // <-- OPRAVA zde
      }
      return token
    },
    async session({ session, token }) {
      // Add the JWT to the session object
      session.user.id = token.id as string
      session.user.name = token.name as string
      session.user.email = token.email as string
      session.accessToken = token.accessToken as string // Add accessToken to session
      return session
    },
    async redirect({ url, baseUrl }) {
      console.log('Redirect URL:', url, 'Base URL:', baseUrl)
      // Redirect to a specific page after login
      if (url === '/api/auth/callback/Credentials') {
        return `${baseUrl}/p3-controls`
      }
      return url.startsWith(baseUrl) ? url : baseUrl
    },
  },
}
