/**
 * Admin tests list handler for the TestPortal admin frontend.
 * Requires a shared password and proxies the tests headers endpoint.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getAdminPassword, getTestPortalApiKey } from '../lib/secrets';

const ALLOWED_ORIGIN = 'https://testportalurl.icecampus.com';
const TESTPORTAL_API_URL = process.env.TESTPORTAL_API_URL || 'https://www.testportal.com/api/v1';

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Password,Authorization'
};

const createResponse = (
  statusCode: number,
  body: Record<string, unknown>
): APIGatewayProxyResult => ({
  statusCode,
  headers: corsHeaders,
  body: JSON.stringify(body)
});

const extractPassword = (event: APIGatewayProxyEvent): string | null => {
  const headerPassword =
    event.headers?.['x-admin-password'] ||
    event.headers?.['X-Admin-Password'] ||
    null;

  if (headerPassword) {
    return headerPassword;
  }

  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader) {
    return null;
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log('[ICE_TESTPORTAL] adminTests invoked', {
    method: event.httpMethod,
    origin: event.headers?.origin || event.headers?.Origin,
    path: event.path
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return createResponse(405, { message: 'Method not allowed' });
  }

  const originHeader = event.headers?.origin || event.headers?.Origin;
  if (originHeader !== ALLOWED_ORIGIN) {
    return createResponse(403, { message: 'Forbidden' });
  }

  const password = extractPassword(event);
  if (!password) {
    return createResponse(401, { message: 'Missing admin password' });
  }

  const expectedPassword = await getAdminPassword();
  if (!expectedPassword) {
    console.error('[ICE_TESTPORTAL] Admin password is not configured');
    return createResponse(500, { message: 'Admin password is not configured' });
  }

  if (password !== expectedPassword) {
    return createResponse(401, { message: 'Invalid credentials' });
  }

  const apiKey = await getTestPortalApiKey();
  if (!apiKey) {
    console.error('[ICE_TESTPORTAL] TestPortal API key is not configured');
    return createResponse(500, { message: 'TestPortal API key is not configured' });
  }

  const url = new URL(`${TESTPORTAL_API_URL}/manager/me/tests/headers`);
  const query = event.queryStringParameters || {};
  if (query.idTestCategory) {
    url.searchParams.set('idTestCategory', query.idTestCategory);
  }
  if (query.name) {
    url.searchParams.set('name', query.name);
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'Api-Key': apiKey
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ICE_TESTPORTAL] TestPortal tests headers request failed', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      return createResponse(502, {
        message: 'Failed to retrieve tests list from TestPortal'
      });
    }

    const data = await response.json();
    return createResponse(200, data);
  } catch (error) {
    console.error('[ICE_TESTPORTAL] Failed to request tests headers', { error });
    return createResponse(502, { message: 'Failed to retrieve tests list from TestPortal' });
  }
};
