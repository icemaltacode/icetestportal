const API_BASE_URL = 'https://a2e1qx66y5.execute-api.eu-south-1.amazonaws.com/prod';

const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const loginCard = document.querySelector('#login-card');
const testsCard = document.querySelector('#tests-card');
const testsBody = document.querySelector('#tests-body');
const testsError = document.querySelector('#tests-error');
const refreshButton = document.querySelector('#refresh-tests');
const searchInput = document.querySelector('#search-input');
const tableHeaders = Array.from(document.querySelectorAll('th[data-sort]'));

const state = {
  password: null,
  tests: [],
  sortKey: 'name',
  sortDirection: 'asc',
  query: ''
};

const setError = (el, message) => {
  el.textContent = message || '';
};

const getCircleLink = (idTest) => `https://testportal.invalid/${idTest}`;

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const temp = document.createElement('textarea');
    temp.value = text;
    document.body.appendChild(temp);
    temp.select();
    const ok = document.execCommand('copy');
    temp.remove();
    return ok;
  }
};

const normalize = (value) => (value || '').toString().toLowerCase();

const updateSortIndicators = () => {
  tableHeaders.forEach((header) => {
    header.classList.remove('sort-asc', 'sort-desc');
    if (header.dataset.sort === state.sortKey) {
      header.classList.add(state.sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
};

const getSortedTests = () => {
  const filtered = state.tests.filter((test) => {
    if (!state.query) return true;
    const haystack = `${test.name || ''} ${test.categoryName || ''} ${test.status || ''}`.toLowerCase();
    return haystack.includes(state.query);
  });

  const direction = state.sortDirection === 'asc' ? 1 : -1;
  return filtered.sort((a, b) => {
    const aValue = normalize(a[state.sortKey]);
    const bValue = normalize(b[state.sortKey]);
    if (aValue < bValue) return -1 * direction;
    if (aValue > bValue) return 1 * direction;
    return 0;
  });
};

const renderTests = () => {
  testsBody.innerHTML = '';
  getSortedTests().forEach((test) => {
    const row = document.createElement('tr');
    row.className = 'test-row';
    row.innerHTML = `
      <td>${test.name || ''}</td>
      <td>${test.categoryName || ''}</td>
      <td>${test.status || ''}</td>
      <td>${test.publicId || ''}</td>
    `;

    const detailsRow = document.createElement('tr');
    detailsRow.className = 'details-row hidden';
    const detailsCell = document.createElement('td');
    detailsCell.colSpan = 4;
    const link = getCircleLink(test.idTest);
    detailsCell.innerHTML = `
      <div class="details">
        <div class="detail-row">
          <span class="detail-label">Circle link</span>
          <code class="detail-value">${link}</code>
          <button type="button" data-copy="${link}">Copy</button>
        </div>
        <div class="detail-row">
          <span class="detail-label">idTest</span>
          <code class="detail-value">${test.idTest || ''}</code>
        </div>
      </div>
    `;
    detailsRow.appendChild(detailsCell);

    row.addEventListener('click', () => {
      detailsRow.classList.toggle('hidden');
    });

    detailsCell.querySelector('button').addEventListener('click', async (event) => {
      event.stopPropagation();
      const button = event.currentTarget;
      if (!button) return;
      const ok = await copyToClipboard(link);
      button.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    });

    testsBody.appendChild(row);
    testsBody.appendChild(detailsRow);
  });

  updateSortIndicators();
};

const fetchTests = async () => {
  setError(testsError, '');
  try {
    const response = await fetch(`${API_BASE_URL}/admin/tests/headers`, {
      headers: {
        'X-Admin-Password': state.password
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load tests (${response.status})`);
    }

    const data = await response.json();
    state.tests = data.tests || [];
    renderTests();
  } catch (error) {
    setError(testsError, error.message || 'Failed to load tests');
  }
};

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  setError(loginError, '');

  const formData = new FormData(loginForm);
  const password = formData.get('password');
  if (!password) {
    setError(loginError, 'Password is required');
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });

    if (!response.ok) {
      throw new Error('Invalid password');
    }

    state.password = password;
    loginCard.classList.add('hidden');
    testsCard.classList.remove('hidden');
    await fetchTests();
  } catch (error) {
    setError(loginError, error.message || 'Login failed');
  }
});

refreshButton.addEventListener('click', () => {
  if (state.password) {
    fetchTests();
  }
});

tableHeaders.forEach((header) => {
  header.addEventListener('click', () => {
    const key = header.dataset.sort;
    if (!key) return;
    if (state.sortKey === key) {
      state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDirection = 'asc';
    }
    renderTests();
  });
});

searchInput.addEventListener('input', (event) => {
  state.query = event.target.value.trim().toLowerCase();
  renderTests();
});
