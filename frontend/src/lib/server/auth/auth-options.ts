// lib/auth/auth-options.ts
import CredentialsProvider from 'next-auth/providers/credentials'
import jwt from 'jsonwebtoken'

import type { NextAuthOptions } from 'next-auth'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'Credetials',
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

        if (
          credentials.username === 'test' &&
          credentials.password === 'test'
        ) {
          const token = jwt.sign(
            {
              username: credentials.username,
              exp: Math.floor(Date.now() / 1000) + 60 * 60 * 36, // 24 hours expiration
            },
            process.env.NEXTAUTH_SECRET || 'default',
          )

          console.log('Generated token:', token)

          return {
            id: '1',
            name: 'Test User',
            email: 'test@eli-beams.eu',
            token: token,
          }
        }

        // Return null if user data could not be retrieved
        return null
      },
    }),
  ],
}
