# Railway Deployment - Frontend & Backend Setup

## Build/Runtime Baseline (Railpack)

1. Remove Dockerfile-based deploys and use Railway default builder (Railpack/Nixpacks).
2. Set build command to: `npm install --omit=dev && npm run build`
3. API start command: `node apps/api/dist/index.js`
4. Worker start command (separate Railway service): `npm run worker -w @labelgen/api`
5. Set `REDIS_URL` to Railway Redis TLS format: `rediss://default:password@host:port`
6. Do not install system Chromium via apt; use bundled `puppeteer` only.

Do not omit `&&` between install and build commands.

## Issue: "Non-JSON response" in Login/Register

This error typically means the frontend is making API requests that aren't reaching the backend, resulting in HTML error pages instead of JSON responses.

## Solution: Configure Frontend API URL for Railway

### For Same Railway Project (Recommended):

1. **Backend Service Setup:**
   - Service name: `api` (or note your actual service name)
   - Expose on port: 3000

2. **Frontend Service Setup:**
   - Go to Variables section in Railway
   - Add new variable: `VITE_API_BASE`
   - Set value to: `http://api:3000` (if service is named "api")
   - Or use public URL: `https://your-backend-service.railway.app`

3. **Redeploy frontend** - Vite environment variables are baked into the build

### For Different Railway Projects:

1. **Backend Service:**
   - Get the public URL (e.g., `https://labelgen-api.railway.app`)

2. **Frontend Service:**
   - Add environment variable: `VITE_API_BASE`
   - Set value to: `https://labelgen-api.railway.app`
   - Redeploy

### Testing the Fix:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Try to login - look for logs:
   ```
   [API] Base URL configured: "http://api:3000"
   [LOGIN] Request URL: http://api:3000/api/auth/login
   [API] Status: 200 OK
   [LOGIN] Success, received token...
   ```

### If Still Getting "Non-JSON response":

1. Check the console logs for the actual URL being requested
2. Verify backend service is running and responding to health check
3. Check CORS headers in response (should have Access-Control-Allow-Origin)

## Local Development

For local dev with backend on `http://localhost:3000`:

```bash
# Update .env
VITE_API_BASE=http://localhost:3000

# Rebuild frontend
npm run build:web

# Start backend
npm --workspace=@labelgen/api run start
```

## Files Modified:
- `apps/web/src/lib/api.ts` - Added detailed error logging
- `apps/web/src/pages/Login.tsx` - Added request logging  
- `apps/web/src/pages/Register.tsx` - Added request logging
- `apps/web/.env` - Updated comments
- `apps/web/.env.production` - Added production setup instructions
