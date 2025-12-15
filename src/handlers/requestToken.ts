/**
 * Request Token Lambda Handler
 *
 * First Lambda in the ICE TestPortal integration flow.
 * Called from Circle.so (VLE) to generate a short-lived authentication token.
 *
 * Flow:
 * 1. Validates that request originates from https://my.icecampus.com
 * 2. Generates a random token
 * 3. Stores token in DynamoDB with 15-minute TTL
 * 4. Returns token to the client
 *
 * Security:
 * - Only accepts requests from allowed origin (CORS)
 * - Tokens are automatically expired via DynamoDB TTL
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { generateToken, storeToken } from '../lib/tokens';

// Only accept requests from the ICE Campus VLE domain
const ALLOWED_ORIGIN = 'https://my.icecampus.com';

// Standard CORS headers for responses
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/**
 * Creates an API Gateway response object
 */
const createResponse = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body)
});

/**
 * Lambda handler for token generation endpoint
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('[ICE_TESTPORTAL] requestToken invoked', {
    method: event.httpMethod,
    origin: event.headers?.origin || event.headers?.Origin,
    path: event.path
  });

  // Handle CORS preflight request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ''
    };
  }

  // Validate HTTP method
  if (event.httpMethod !== 'POST') {
    console.warn('[ICE_TESTPORTAL] Invalid HTTP method', { method: event.httpMethod });
    return createResponse(405, { message: 'Method not allowed' });
  }

  // Validate origin header to ensure request comes from VLE
  const originHeader = event.headers?.origin || event.headers?.Origin;

  if (originHeader !== ALLOWED_ORIGIN) {
    console.warn('[ICE_TESTPORTAL] Request from unauthorized origin', {
      received: originHeader,
      expected: ALLOWED_ORIGIN
    });
    return createResponse(403, { message: 'Forbidden' });
  }

  try {
    // Generate new token
    const token = generateToken();

    // Store token in DynamoDB with TTL
    await storeToken(token);

    console.log('[ICE_TESTPORTAL] Token generated and stored successfully', {
      tokenPrefix: token.substring(0, 8) + '...'
    });

    // Return token to client
    return createResponse(200, { token });

  } catch (error) {
    console.error('[ICE_TESTPORTAL] Failed to generate token', { error });

    return createResponse(500, {
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
