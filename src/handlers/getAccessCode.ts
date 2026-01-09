/**
 * Get Access Code Lambda Handler
 *
 * Second Lambda in the ICE TestPortal integration flow.
 * Validates the authentication token and retrieves a test access code from TestPortal.
 *
 * Flow:
 * 1. Receives request with token, testId, and email
 * 2. Validates the token against DynamoDB
 * 3. If valid, calls TestPortal API to get access code
 * 4. Returns access code to the client
 *
 * Security:
 * - Validates authentication token before proceeding
 * - Token must exist and not be expired
 * - Only accepts requests from allowed origin (CORS)
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateToken } from '../lib/tokens';
import { requestAccessCode } from '../lib/testportal';

// Only accept requests from the ICE Campus VLE domain
const ALLOWED_ORIGIN = 'https://my.icecampus.com';

// Standard CORS headers for responses
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

/**
 * Request body structure expected from the client
 */
interface AccessCodeRequestBody {
  token: string;
  testId: string;
}

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
 * Validates the request body contains all required fields
 */
const validateRequestBody = (body: unknown): body is AccessCodeRequestBody => {
  if (!body || typeof body !== 'object') {
    return false;
  }

  const { token, testId } = body as Record<string, unknown>;

  return (
    typeof token === 'string' && token.length > 0 &&
    typeof testId === 'string' && testId.length > 0
  );
};

/**
 * Lambda handler for access code retrieval endpoint
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('[ICE_TESTPORTAL] getAccessCode invoked', {
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

  // Parse and validate request body
  let requestBody: unknown;
  try {
    requestBody = event.body ? JSON.parse(event.body) : null;
  } catch {
    console.warn('[ICE_TESTPORTAL] Invalid JSON in request body');
    return createResponse(400, { message: 'Invalid JSON in request body' });
  }

  if (!validateRequestBody(requestBody)) {
    console.warn('[ICE_TESTPORTAL] Missing required fields in request body', {
      hasToken: !!(requestBody as Record<string, unknown>)?.token,
      hasTestId: !!(requestBody as Record<string, unknown>)?.testId
    });
    return createResponse(400, {
      message: 'Missing required fields: token and testId are required'
    });
  }

  const { token, testId } = requestBody;

  console.log('[ICE_TESTPORTAL] Processing access code request', {
    tokenPrefix: token.substring(0, 8) + '...',
    testId
  });

  // Validate the authentication token
  const isValidToken = await validateToken(token);

  if (!isValidToken) {
    console.warn('[ICE_TESTPORTAL] Token validation failed', {
      tokenPrefix: token.substring(0, 8) + '...'
    });
    return createResponse(401, { message: 'Invalid or expired token' });
  }

  // Request access code from TestPortal API
  const result = await requestAccessCode(testId);

  if (!result.success) {
    console.error('[ICE_TESTPORTAL] Failed to get access code from TestPortal', {
      testId,
      error: result.error
    });
    return createResponse(502, {
      message: 'Failed to retrieve access code from TestPortal',
      error: result.error
    });
  }

  console.log('[ICE_TESTPORTAL] Access code retrieved successfully', {
    testId,
    isDevelopmentMode: result.isDevelopmentMode,
    accessCodePrefix: result.accessCode?.substring(0, 4) + '...'
  });

  // Return success response with access code
  return createResponse(200, {
    accessCode: result.accessCode,
    ...(result.isDevelopmentMode && { _dev: true })
  });
};
