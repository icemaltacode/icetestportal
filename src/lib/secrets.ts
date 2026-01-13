/**
 * AWS Secrets Manager utilities for ICE TestPortal integration.
 * Handles retrieval of sensitive configuration like API keys.
 */

import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Initialize Secrets Manager client
const secretsClient = new SecretsManagerClient({});

// Cache for secrets to avoid repeated API calls within the same Lambda invocation
const secretsCache: Map<string, string> = new Map();

/**
 * Retrieves a secret value from AWS Secrets Manager.
 * Results are cached for the lifetime of the Lambda container.
 *
 * @param secretName - The name/ARN of the secret to retrieve
 * @returns The secret value as a string, or null if not found/error
 */
export const getSecret = async (secretName: string): Promise<string | null> => {
  // Check cache first
  if (secretsCache.has(secretName)) {
    console.log('[ICE_TESTPORTAL] Using cached secret', { secretName });
    return secretsCache.get(secretName)!;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName
      })
    );

    const secretValue = response.SecretString;

    if (!secretValue) {
      console.warn('[ICE_TESTPORTAL] Secret has no string value', { secretName });
      return null;
    }

    // Cache the result
    secretsCache.set(secretName, secretValue);
    console.log('[ICE_TESTPORTAL] Secret retrieved and cached', { secretName });

    return secretValue;
  } catch (error: unknown) {
    // Handle case where secret doesn't exist (expected during development)
    if (error instanceof Error && error.name === 'ResourceNotFoundException') {
      console.warn('[ICE_TESTPORTAL] Secret not found (development mode?)', { secretName });
      return null;
    }

    console.error('[ICE_TESTPORTAL] Failed to retrieve secret', { secretName, error });
    return null;
  }
};

/**
 * Retrieves the TestPortal API key from Secrets Manager.
 * Returns null if not configured (triggers development mode behavior).
 */
export const getTestPortalApiKey = async (): Promise<string | null> => {
  const secretName = process.env.TESTPORTAL_SECRET_NAME;

  if (!secretName) {
    console.warn('[ICE_TESTPORTAL] TESTPORTAL_SECRET_NAME not configured');
    return null;
  }

  const secretValue = await getSecret(secretName);

  if (!secretValue) {
    return null;
  }

  // Secret may be stored as JSON with an 'apiKey' field, or as plain text
  try {
    const parsed = JSON.parse(secretValue);
    return parsed.apiKey || parsed.api_key || secretValue;
  } catch {
    // Not JSON, return as-is
    return secretValue;
  }
};

/**
 * Retrieves the admin password for the TestPortal admin frontend.
 */
export const getAdminPassword = async (): Promise<string | null> => {
  const secretName = process.env.ADMIN_PASSWORD_SECRET_NAME;

  if (!secretName) {
    console.warn('[ICE_TESTPORTAL] ADMIN_PASSWORD_SECRET_NAME not configured');
    return null;
  }

  const secretValue = await getSecret(secretName);
  if (!secretValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(secretValue);
    return parsed.password || parsed.adminPassword || secretValue;
  } catch {
    return secretValue;
  }
};
