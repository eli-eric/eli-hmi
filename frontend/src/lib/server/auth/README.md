# Authentication System Documentation

This document explains the authentication system used in the ELI HMI frontend project.

## Overview

The application uses NextAuth.js for authentication with a custom LDAP integration. The authentication system is designed to:

1. Work with LDAP authentication in production environments
2. Use a test user in development environments
3. Generate JWT tokens for authenticated users

## Environment Configuration

Copy the env.example file to .env.local and fill in the values:

```bash
cp env.example .env.local
```

Key environment variables:

- `NEXTAUTH_SECRET`: Secret used to sign JWT tokens
- `LDAP_SERVER_URL`: URL of the LDAP server (e.g., ldap://10.78.0.11)
- `LDAP_BASE_DN`: Base DN for LDAP searches (e.g., dc=lcs,dc=local)
- `LDAP_USE_TLS`: Whether to use TLS for LDAP connections (true/false)
- `NODE_ENV`: Set to "development" to enable test user, "production" for strict LDAP authentication

## Development Mode

In development mode (`NODE_ENV=development`), you can use the test credentials:

- Username: test
- Password: test

This allows for development without an LDAP server.

## Production Mode

In production mode, the system will authenticate against the LDAP server using the provided credentials. Users need to provide their LDAP username and password.

The username will be formatted as an email address (username@lcs.local) if it doesn't already contain an @ symbol.

## Authentication Flow

1. User enters credentials in the sign-in form
2. Credentials are sent to the NextAuth endpoint
3. For production: Credentials are validated against LDAP server
4. For development: Test credentials are accepted if configured
5. Upon successful authentication, a JWT token is generated
6. The token and user information are stored in the session
7. User is redirected to the main application

## LDAP Configuration

The LDAP authentication is configured to work with Active Directory. It searches for users by sAMAccountName and retrieves:

- Common Name (cn)
- Email (mail)
- sAMAccountName

These attributes are used to create the user profile in the application.
