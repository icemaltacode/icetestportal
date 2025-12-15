# ICE TestPortal Integration

Serverless backend for integrating Circle.so VLE with TestPortal.com.

## Architecture Overview

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│   Circle.so VLE     │────▶│   AWS Lambda (1)     │────▶│    DynamoDB     │
│  (ice-header.js)    │     │   requestToken       │     │  (tokens table) │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
          │
          │ token + testId + email
          ▼
┌──────────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   AWS Lambda (2)     │────▶│  Secrets Manager    │────▶│  TestPortal API │
│   getAccessCode      │     │  (API key)          │     │                 │
└──────────────────────┘     └─────────────────────┘     └─────────────────┘
          │
          │ accessCode
          ▼
┌─────────────────────┐
│ testportal.net/...  │
│   ?p={accessCode}   │
└─────────────────────┘
```

## Prerequisites

- Node.js 22.x or later
- AWS CLI configured with profile `ice`
- Serverless Framework v4 (`npm install -g serverless`)

## Project Structure

```
ICETestPortal/
├── src/
│   ├── handlers/
│   │   ├── requestToken.ts    # Lambda 1: Generate auth token
│   │   └── getAccessCode.ts   # Lambda 2: Get test access code
│   └── lib/
│       ├── tokens.ts          # Token generation/validation
│       ├── secrets.ts         # AWS Secrets Manager helper
│       └── testportal.ts      # TestPortal API client
├── integrations/
│   └── circle/
│       └── ice-header.js      # Client-side JS for Circle.so
├── serverless.yml             # Serverless Framework config
├── package.json
├── tsconfig.json
└── README.md
```

## Deployment

### 1. Install Dependencies

```bash
cd ICETestPortal
npm install
```

### 2. Deploy to AWS

```bash
# Deploy to dev stage (default)
npm run deploy

# Or deploy to production
npm run deploy:prod
```

The deployment will output the API Gateway endpoint URL. Note this URL for the next steps.

Example output:
```
endpoints:
  POST - https://abc123xyz.execute-api.eu-south-1.amazonaws.com/dev/token/request
  POST - https://abc123xyz.execute-api.eu-south-1.amazonaws.com/dev/test/access-code
```

### 3. Configure TestPortal API Key (Production Only)

Once you have your TestPortal API credentials, create a secret in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name "ice-testportal/testportal-api-key/dev" \
  --secret-string '{"apiKey":"YOUR_TESTPORTAL_API_KEY"}' \
  --region eu-south-1 \
  --profile ice
```

For production:
```bash
aws secretsmanager create-secret \
  --name "ice-testportal/testportal-api-key/prod" \
  --secret-string '{"apiKey":"YOUR_TESTPORTAL_API_KEY"}' \
  --region eu-south-1 \
  --profile ice
```

> **Note:** Until the API key is configured, the `getAccessCode` Lambda will return mock access code `ABC123MOCK` for testing.

### 4. Update Circle.so Header Script

1. Open `integrations/circle/ice-header.js`
2. Find the `API_BASE_URL` constant near the top of the file
3. Replace `YOUR_API_GATEWAY_ID` with your actual API Gateway ID from the deployment output

```javascript
const API_BASE_URL = 'https://abc123xyz.execute-api.eu-south-1.amazonaws.com/dev';
```

4. Copy the entire `ice-header.js` content to Circle.so's custom header JS settings

## Testing

### Test Token Generation

```bash
# From the allowed origin (should succeed)
curl -X POST https://YOUR_API_ID.execute-api.eu-south-1.amazonaws.com/dev/token/request \
  -H "Content-Type: application/json" \
  -H "Origin: https://my.icecampus.com"

# Expected response:
# {"token":"abc123def456..."}
```

### Test Access Code Retrieval

```bash
# Replace TOKEN with the token from the previous step
curl -X POST https://YOUR_API_ID.execute-api.eu-south-1.amazonaws.com/dev/test/access-code \
  -H "Content-Type: application/json" \
  -H "Origin: https://my.icecampus.com" \
  -d '{"token":"YOUR_TOKEN_HERE","testId":"test123","email":"student@example.com"}'

# Expected response (development mode):
# {"accessCode":"ABC123MOCK","_dev":true}
```

### View Logs

```bash
# View requestToken logs
npm run logs:token

# View getAccessCode logs
npm run logs:access
```

## API Reference

### POST /token/request

Generates a short-lived authentication token.

**Headers:**
- `Origin: https://my.icecampus.com` (required)
- `Content-Type: application/json`

**Response:**
```json
{
  "token": "abc123def456789..."
}
```

### POST /test/access-code

Validates token and retrieves test access code from TestPortal.

**Headers:**
- `Origin: https://my.icecampus.com` (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "token": "abc123def456789...",
  "testId": "your-test-public-id",
  "email": "student@example.com"
}
```

**Response:**
```json
{
  "accessCode": "XYZ789...",
  "_dev": true  // Only present in development mode
}
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TOKENS_TABLE` | DynamoDB table name for tokens | `ice-testportal-tokens-{stage}` |
| `TESTPORTAL_SECRET_NAME` | Secrets Manager secret name | `ice-testportal/testportal-api-key/{stage}` |
| `TESTPORTAL_API_URL` | TestPortal API endpoint | `https://api.testportal.net/v1` |

### CORS Configuration

The API only accepts requests from `https://my.icecampus.com`. This is enforced both at the API Gateway level and within the Lambda handlers.

## Cleanup

To remove all deployed resources:

```bash
npm run remove
```

> **Warning:** This will delete the DynamoDB table and all data. The Secrets Manager secret must be deleted separately if created.

## Troubleshooting

### "Forbidden" error when calling the API

- Ensure requests include the `Origin: https://my.icecampus.com` header
- In browser dev tools, check that CORS preflight requests succeed

### "Invalid or expired token" error

- Tokens expire after 15 minutes
- Ensure you're using a freshly generated token
- Check that the token was generated successfully (no errors in requestToken logs)

### Mock access code returned instead of real one

- The TestPortal API key hasn't been configured in Secrets Manager
- Check the secret name matches the expected pattern
- Verify the secret contains valid JSON with an `apiKey` field

### Deployment fails

- Ensure AWS CLI profile `ice` is configured correctly
- Check you have permissions to create Lambda, API Gateway, DynamoDB, and IAM resources
- Verify Node.js 22.x is supported in your target region
