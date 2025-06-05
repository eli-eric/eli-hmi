/**
 * This module provides functions to authenticate users against an LDAP server
 * It can be used in both development and production environments
 */
import { authenticate } from 'ldap-authentication'

// LDAP server configuration
// These should be set in the environment variables
const LDAP_SERVER_URL = process.env.LDAP_SERVER_URL || 'ldap://10.78.0.11'
const LDAP_BASE_DN = process.env.LDAP_BASE_DN || 'dc=lcs,dc=local'
const LDAP_USE_TLS = process.env.LDAP_USE_TLS === 'true'

export interface LdapUser {
  username: string
}

/**
 * Authenticates a user against an LDAP server using the provided username and password.
 *
 * @param username The username to authenticate.
 * @param password The password for the given username.
 * @returns User object if authentication is successful, null otherwise.
 */
export async function ldapAuthenticate(
  username: string,
  password: string,
): Promise<LdapUser | null> {
  // For development environment, allow test user
  if (
    process.env.NODE_ENV === 'development' &&
    username === 'test' &&
    password === 'test'
  ) {
    console.log('Development mode: Using test user')
    return {
      username: 'test',
    }
  }

  try {
    // Format the username as a full email address if it doesn't already contain '@'
    const userPrincipal = username.includes('@')
      ? username
      : `${username}@lcs.local`

    console.log(`Attempting LDAP authentication for user: ${username}`)

    // Authenticate with LDAP
    const user = await authenticate({
      ldapOpts: {
        url: LDAP_SERVER_URL,
        tlsOptions: LDAP_USE_TLS ? { rejectUnauthorized: false } : undefined,
      },
      userDn: userPrincipal,
      userPassword: password,
    })
    console.log('LDAP Authentication response:', user)
    console.log('LDAP Authentication successful')
    return {
      username,
    }
  } catch (error) {
    console.error('LDAP Authentication failed:', error)
  }

  return null
}
