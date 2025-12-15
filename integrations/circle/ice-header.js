// ============================================
// Testportal Link Updater (tests/exams)
// Usage: <a href="https://testportal.invalid/YOUR_TEST_ID">Start Test</a>
// ============================================
(() => {
  // TODO: Update this URL after deploying the serverless backend
  const API_BASE_URL = 'https://YOUR_API_GATEWAY_ID.execute-api.eu-south-1.amazonaws.com/dev';
  const TESTPORTAL_URL = 'https://www.testportal.net/exam/start.html';
  const SEL = 'a[href^="https://testportal.invalid/"]';
  let observer;

  // Get current Circle.so user
  const getCircleUser = () => {
    return window.circleUser || null;
  };

  // Get user email from Circle.so user object or localStorage
  const getUserEmail = (user) => {
    if (user?.email) return user.email;
    try {
      const k = Object.keys(localStorage).find(k => k.startsWith('_pendo_visitorId'));
      if (k) {
        const email = JSON.parse(localStorage.getItem(k) || '{}')?.value || null;
        if (email) return email;
      }
      const ctx = JSON.parse(localStorage.getItem('V1-PunditUserContext') || 'null');
      return ctx?.current_user?.email || null;
    } catch { return null; }
  };

  // Request a short-lived authentication token from our backend
  const requestToken = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/token/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Unexpected status ${response.status}`);
      }

      const data = await response.json();
      if (!data?.token) {
        throw new Error('Token missing in response');
      }

      return data.token;
    } catch (error) {
      console.error('[ICE] Testportal: Failed to fetch token', error);
      return null;
    }
  };

  // Request test access code from our backend
  const getAccessCode = async (token, testId, email) => {
    try {
      const response = await fetch(`${API_BASE_URL}/test/access-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, testId, email })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Unexpected status ${response.status}`);
      }

      const data = await response.json();
      if (!data?.accessCode) {
        throw new Error('Access code missing in response');
      }

      return data.accessCode;
    } catch (error) {
      console.error('[ICE] Testportal: Failed to get access code', error);
      return null;
    }
  };

  // Navigate to TestPortal with the access code
  const submitToTestportal = (accessCode) => {
    const url = `${TESTPORTAL_URL}?p=${encodeURIComponent(accessCode)}`;
    window.open(url, '_blank', 'noopener');
  };

  // Main flow: get token -> get access code -> redirect to TestPortal
  const launchTest = async (testId, user) => {
    const email = getUserEmail(user);
    if (!email) {
      alert('Unable to determine your email address. Please try again.');
      return;
    }

    console.log('[ICE] Testportal: Launching test', testId, 'for', email);

    // Step 1: Get authentication token
    const token = await requestToken();
    if (!token) {
      alert('We could not prepare the test. Please try again.');
      return;
    }

    // Step 2: Get access code from TestPortal via our backend
    const accessCode = await getAccessCode(token, testId, email);
    if (!accessCode) {
      alert('We could not retrieve your test access code. Please try again.');
      return;
    }

    // Step 3: Redirect to TestPortal
    console.log('[ICE] Testportal: Redirecting with access code');
    submitToTestportal(accessCode);
  };

  const updateTestportal = () => {
    const user = getCircleUser();
    if (!user) return false;

    const links = document.querySelectorAll(SEL);
    if (!links.length) return false;

    let updatedCount = 0;
    links.forEach(a => {
      if (a.dataset.testportalHandled === 'true') return;

      try {
        const testId = a.getAttribute('href').replace('https://testportal.invalid/', '').trim();
        if (!testId || testId === 'PLACEHOLDER_TESTID') {
          console.warn('[ICE] Testportal: Missing test ID in link:', a);
          return;
        }

        // Remove Circle's attributes that interfere with our handler
        a.removeAttribute('target');
        a.removeAttribute('rel');

        a.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const currentUser = getCircleUser();
          if (!currentUser) {
            alert('Please log in to start the test.');
            return;
          }
          await launchTest(testId, currentUser);
        });

        a.dataset.testportalHandled = 'true';
        console.log('[ICE] Testportal: Bound link →', testId);
        updatedCount++;
      } catch (e) {
        console.warn('[ICE] Testportal: Failed binding link:', e);
      }
    });

    return updatedCount > 0;
  };

  updateTestportal();
  setInterval(updateTestportal, 2000);
  observer = new MutationObserver(() => updateTestportal());
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', updateTestportal);
  console.log('[ICE] Testportal link updater ready.');
})();
