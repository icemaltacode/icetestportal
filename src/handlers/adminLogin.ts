/**
 * Admin login handler for the TestPortal admin frontend.
 * Validates a shared password stored in Secrets Manager.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAdminPassword } from '../lib/secrets';

const ALLOWED_ORIGIN = 'https://testportalurl.icecampus.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

const createResponse = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body)
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('[ICE_TESTPORTAL] adminLogin invoked', {
    method: event.httpMethod,
    origin: event.headers?.origin || event.headers?.Origin,
    path: event.path
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return createResponse(405, { message: 'Method not allowed' });
  }

  const originHeader = event.headers?.origin || event.headers?.Origin;
  if (originHeader !== ALLOWED_ORIGIN) {
    return createResponse(403, { message: 'Forbidden' });
  }

  let requestBody: unknown;
  try {
    requestBody = event.body ? JSON.parse(event.body) : null;
  } catch {
    return createResponse(400, { message: 'Invalid JSON in request body' });
  }

  const password = (requestBody as Record<string, unknown>)?.password;
  if (typeof password !== 'string' || password.length === 0) {
    return createResponse(400, { message: 'Password is required' });
  }

  const expectedPassword = await getAdminPassword();
  if (!expectedPassword) {
    console.error('[ICE_TESTPORTAL] Admin password is not configured');
    return createResponse(500, { message: 'Admin password is not configured' });
  }

  if (password !== expectedPassword) {
    return createResponse(401, { message: 'Invalid credentials' });
  }

  return createResponse(200, { ok: true });
};
