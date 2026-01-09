// ============================================
// Testportal Link Updater (tests/exams)
// Usage: <a href="https://testportal.invalid/YOUR_TEST_ID">Start Test</a>
// ============================================
(() => {
  const API_BASE_URL = 'https://gs8iaekpl2.execute-api.eu-south-1.amazonaws.com/dev';
  const TESTPORTAL_START_URL = 'https://icecampus.testportal.net/exam/start.html';
  const SEL = 'a[href^="https://testportal.invalid/"]';
  let observer;

  // Get current Circle.so user
  const getCircleUser = () => {
    return window.circleUser || null;
  };

  const getUserNameParts = (user) => {
    const firstName = user?.firstName || user?.first_name || null;
    const lastName = user?.lastName || user?.last_name || null;
    if (firstName && lastName) {
      return { firstName, lastName };
    }

    const fullName = user?.name || user?.full_name || null;
    if (!fullName || typeof fullName !== 'string') {
      return { firstName: null, lastName: null };
    }

    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: null };
    }

    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1]
    };
  };

  const getPersonUid = (user) => user?.id || user?.uid || null;
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

  const requestAccessCode = async (token, testId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/test/access-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, testId })
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

  const submitStartTest = (accessCode, user) => {
    const { firstName, lastName } = getUserNameParts(user);

    if (!firstName || !lastName) {
      alert('Please add your first and last name to start this test.');
      return;
    }

    const startTestRequest = {
      accessCode,
      autoSubmit: false,
      startPageReadOnly: true,
      personalData: {
        firstName,
        lastName
      }
    };

    const personUID = getPersonUid(user) || getUserEmail(user);
    if (personUID) {
      startTestRequest.personUID = String(personUID);
    }

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = TESTPORTAL_START_URL;
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'startTestRequest';
    input.value = JSON.stringify(startTestRequest);

    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();

    setTimeout(() => form.remove(), 1000);
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
          const token = await requestToken();
          if (!token) {
            alert('We could not prepare the test. Please try again.');
            return;
          }

          const accessCode = await requestAccessCode(token, testId);
          if (!accessCode) {
            alert('We could not retrieve your test access code. Please try again.');
            return;
          }

          submitStartTest(accessCode, currentUser);
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
