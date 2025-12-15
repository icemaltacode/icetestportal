/**
 * TestPortal API client for ICE TestPortal integration.
 * Handles communication with the TestPortal API to retrieve test access codes.
 */

import { getTestPortalApiKey } from './secrets';

// Mock access code returned when API key is not configured (development mode)
const MOCK_ACCESS_CODE = 'ABC123MOCK';

// TestPortal API endpoint (placeholder - update when actual API details are known)
const TESTPORTAL_API_URL = process.env.TESTPORTAL_API_URL || 'https://api.testportal.net/v1';

/**
 * Request payload for TestPortal API
 */
interface AccessCodeRequest {
  testId: string;
  email: string;
}

/**
 * Response from TestPortal API (assumed structure - update when API is documented)
 */
interface TestPortalApiResponse {
  accessCode?: string;
  access_code?: string;
  code?: string;
  error?: string;
  message?: string;
}

/**
 * Result of access code request
 */
export interface AccessCodeResult {
  success: boolean;
  accessCode?: string;
  error?: string;
  isDevelopmentMode?: boolean;
}

/**
 * Requests a test access code from the TestPortal API.
 *
 * In development mode (when API key is not configured), returns a mock access code.
 *
 * @param testId - The TestPortal test ID
 * @param email - Student's email address (for logging/auditing)
 * @returns AccessCodeResult with the access code or error details
 */
export const requestAccessCode = async (
  testId: string,
  email: string
): Promise<AccessCodeResult> => {
  // Get API key from Secrets Manager
  const apiKey = await getTestPortalApiKey();

  // Development mode: return mock access code when API key is not configured
  if (!apiKey) {
    console.log('[ICE_TESTPORTAL] Development mode: returning mock access code', {
      testId,
      email,
      mockCode: MOCK_ACCESS_CODE
    });

    return {
      success: true,
      accessCode: MOCK_ACCESS_CODE,
      isDevelopmentMode: true
    };
  }

  // Production mode: call TestPortal API
  try {
    console.log('[ICE_TESTPORTAL] Requesting access code from TestPortal API', {
      testId,
      email,
      apiUrl: TESTPORTAL_API_URL
    });

    const response = await fetch(`${TESTPORTAL_API_URL}/access-codes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // Alternative header formats - uncomment if needed based on actual API
        // 'X-API-Key': apiKey,
        // 'Api-Key': apiKey,
      },
      body: JSON.stringify({
        testId,
        email,
        // Additional fields that might be required - update based on actual API
        // testPublicId: testId,
        // studentEmail: email,
      } as AccessCodeRequest)
    });

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[ICE_TESTPORTAL] TestPortal API error response', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });

      return {
        success: false,
        error: `TestPortal API returned ${response.status}: ${response.statusText}`
      };
    }

    // Parse successful response
    const data: TestPortalApiResponse = await response.json();

    // Extract access code (handle multiple possible field names)
    const accessCode = data.accessCode || data.access_code || data.code;

    if (!accessCode) {
      console.error('[ICE_TESTPORTAL] TestPortal API response missing access code', { data });
      return {
        success: false,
        error: 'TestPortal API response did not contain an access code'
      };
    }

    console.log('[ICE_TESTPORTAL] Access code received from TestPortal API', {
      testId,
      email,
      accessCodePrefix: accessCode.substring(0, 4) + '...'
    });

    return {
      success: true,
      accessCode
    };

  } catch (error) {
    console.error('[ICE_TESTPORTAL] Failed to request access code from TestPortal API', {
      testId,
      email,
      error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
