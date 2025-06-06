/**
 * This module provides a function to authenticate users against an LDAP server using the provided
 * username and password. The LDAP server's address and the username should be configured in the
 * LDAP_SERVER_URL variable. The function returns the username if authentication is successful,
 * and null otherwise. The function logs various stages of the LDAP authentication process.
 */
import { Client } from 'ldapts'

// LDAP server configuration
// These should be set in the environment variables
const LDAP_SERVER_URL = process.env.LDAP_SERVER_URL || 'ldap://10.78.0.11'

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
    console.log('Setting up LDAP server...')

    // TLS configuration
    const tlsOptions = {
      rejectUnauthorized: true,
    }

    // Create a client instance
    const client = new Client({
      url: LDAP_SERVER_URL,
      tlsOptions,
    })

    console.log('Attempting to connect to LDAP server...')

    // Bind to LDAP server
    await client.bind(username, password)

    console.log('Successfully authenticated with LDAP server.')

    // Unbind from LDAP server
    await client.unbind()
    console.log('Disconnected from LDAP server.')

    return {
      username,
    }
  } catch (error) {
    console.error('An unexpected error occurred during LDAP operation.')
    console.error('Error details:', error)
  }

  return null
}
