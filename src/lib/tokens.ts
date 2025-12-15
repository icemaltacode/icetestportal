/**
 * Token management utilities for ICE TestPortal integration.
 * Handles generation, storage, and validation of short-lived authentication tokens.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Initialize DynamoDB Document Client with default configuration
const dynamoDbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Table name from environment variable (set in serverless.yml)
const TOKENS_TABLE = process.env.TOKENS_TABLE!;

// Token validity period: 15 minutes in seconds
const TOKEN_TTL_SECONDS = 15 * 60;

/**
 * Token record structure stored in DynamoDB
 */
export interface TokenRecord {
  token: string;
  ttl: number;        // Unix timestamp for automatic DynamoDB TTL expiration
  createdAt: number;  // Unix timestamp when token was created
}

/**
 * Returns current time as Unix timestamp in seconds
 */
const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/**
 * Generates a new random token.
 * Uses UUID v4 with hyphens removed for a clean 32-character hex string.
 */
export const generateToken = (): string => randomUUID().replace(/-/g, '');

/**
 * Stores a token in DynamoDB with automatic TTL expiration.
 * Token will be automatically deleted by DynamoDB after 15 minutes.
 *
 * @param token - The token string to store
 */
export const storeToken = async (token: string): Promise<void> => {
  const now = nowSeconds();
  const expires = now + TOKEN_TTL_SECONDS;

  await dynamoDbClient.send(
    new PutCommand({
      TableName: TOKENS_TABLE,
      Item: {
        token,
        ttl: expires,
        createdAt: now
      }
    })
  );

  console.log('[ICE_TESTPORTAL] Token stored', {
    token: token.substring(0, 8) + '...', // Log partial token for debugging
    expiresIn: TOKEN_TTL_SECONDS,
    expiresAt: new Date(expires * 1000).toISOString()
  });
};

/**
 * Validates a token by checking if it exists and hasn't expired.
 * Note: Tokens can be used multiple times within their validity window.
 *
 * @param token - The token string to validate
 * @returns true if token is valid, false otherwise
 */
export const validateToken = async (token: string): Promise<boolean> => {
  if (!token || typeof token !== 'string') {
    console.log('[ICE_TESTPORTAL] Token validation failed: invalid token format');
    return false;
  }

  try {
    const result = await dynamoDbClient.send(
      new GetCommand({
        TableName: TOKENS_TABLE,
        Key: { token }
      })
    );

    const record = result.Item as TokenRecord | undefined;

    // Token not found in database
    if (!record) {
      console.log('[ICE_TESTPORTAL] Token validation failed: token not found', {
        token: token.substring(0, 8) + '...'
      });
      return false;
    }

    // Check if token has expired (belt-and-suspenders check; DynamoDB TTL may have lag)
    const now = nowSeconds();
    if (record.ttl < now) {
      console.log('[ICE_TESTPORTAL] Token validation failed: token expired', {
        token: token.substring(0, 8) + '...',
        expiredAt: new Date(record.ttl * 1000).toISOString()
      });
      return false;
    }

    console.log('[ICE_TESTPORTAL] Token validated successfully', {
      token: token.substring(0, 8) + '...',
      createdAt: new Date(record.createdAt * 1000).toISOString(),
      expiresAt: new Date(record.ttl * 1000).toISOString()
    });

    return true;
  } catch (error) {
    console.error('[ICE_TESTPORTAL] Token validation error', { error });
    return false;
  }
};
