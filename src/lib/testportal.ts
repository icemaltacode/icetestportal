/**
 * TestPortal API client for ICE TestPortal integration.
 * Handles communication with the TestPortal API to retrieve test access codes.
 */

import { getTestPortalApiKey } from './secrets';

// Mock access code returned when API key is not configured (development mode)
const MOCK_ACCESS_CODE = 'ABC123MOCK';

// TestPortal API base URL
const TESTPORTAL_API_URL = process.env.TESTPORTAL_API_URL || 'https://www.testportal.com/api/v1';

/**
 * Request payload for TestPortal API
 */
interface AccessCodeRequest {
  count: number;
  sendInvitationOnTestActivation?: boolean;
}

/**
 * Response from TestPortal API (assumed structure - update when API is documented)
 */
interface TestPortalApiResponse {
  accessCodes?: Array<{
    accessCode?: string;
    access_code?: string;
    code?: string;
  }>;
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
  testId: string
): Promise<AccessCodeResult> => {
  // Get API key from Secrets Manager
  const apiKey = await getTestPortalApiKey();

  // Development mode: return mock access code when API key is not configured
  if (!apiKey) {
    console.log('[ICE_TESTPORTAL] Development mode: returning mock access code', {
      testId,
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
      apiUrl: TESTPORTAL_API_URL
    });

    const response = await fetch(
      `${TESTPORTAL_API_URL}/manager/me/tests/${testId}/current-date/access-codes/add`,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey
      },
      body: JSON.stringify({
        count: 1,
        sendInvitationOnTestActivation: false
      } as AccessCodeRequest)
      }
    );

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

    const accessCodeEntry = data.accessCodes?.[0];
    const accessCode =
      accessCodeEntry?.accessCode ||
      accessCodeEntry?.access_code ||
      accessCodeEntry?.code;

    if (!accessCode) {
      console.error('[ICE_TESTPORTAL] TestPortal API response missing access code', {
        data
      });
      return {
        success: false,
        error: 'TestPortal API response did not contain an access code'
      };
    }

    console.log('[ICE_TESTPORTAL] Access code received from TestPortal API', {
      testId,
      accessCodePrefix: accessCode.substring(0, 4) + '...'
    });

    return {
      success: true,
      accessCode
    };

  } catch (error) {
    console.error('[ICE_TESTPORTAL] Failed to request access code from TestPortal API', {
      testId,
      error
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};
