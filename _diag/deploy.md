## Deploy Equipment Selector — commit cd70f87f3c363bc65d941d56ad5e841f1c8cfd2d

Run: 24739661603

### equipment-selector tree
```
equipment-selector/functions/api/catalog.js
equipment-selector/functions/api/ping.js
equipment-selector/index.html
equipment-selector/logo.png
equipment-selector/package.json
```

### wrangler.log
```
🪵  Writing logs to "/home/runner/.config/.wrangler/logs/wrangler-2026-04-21_18-33-06_479.log"
Failed to load .env file ".env": Error: ENOENT: no such file or directory, open '.env'
    at Object.openSync (node:fs:573:18)
    at Object.readFileSync (node:fs:452:35)
    at tryLoadDotEnv (/home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:116864:72)
    at loadDotEnv (/home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:116873:12)
    at /home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:174514:20
    at /home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:138085:16
    at maybeAsyncResult (/home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:136306:44)
    at /home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:138084:14
    at /home/runner/.npm/_npx/c39b96b4691e9531/node_modules/wrangler/wrangler-dist/cli.js:136293:22
    at Array.reduce (<anonymous>) {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: '.env'
}
No experimental flag store instantiated
Attempted to use flag "JSON_CONFIG_FILE" which has not been instantiated
No folder available to cache configuration
-- START CF API REQUEST: GET https://api.cloudflare.com/client/v4/accounts/3bfa1c299fec4bcadf683393bce8b53d/pages/projects/pasadena-equipment
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
-- START CF API REQUEST: GET https://api.cloudflare.com/client/v4/accounts/3bfa1c299fec4bcadf683393bce8b53d/pages/projects/pasadena-equipment
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
No experimental flag store instantiated
Attempted to use flag "JSON_CONFIG_FILE" which has not been instantiated
✨ Compiled Worker successfully
-- START CF API REQUEST: GET https://api.cloudflare.com/client/v4/accounts/3bfa1c299fec4bcadf683393bce8b53d/pages/projects/pasadena-equipment/upload-token
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/pages/assets/check-missing
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
Uploading... (3/7)
POST /pages/assets/upload
-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/pages/assets/upload
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
POST /pages/assets/upload
-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/pages/assets/upload
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
POST /pages/assets/upload
-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/pages/assets/upload
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
result: { successful_key_count: 1, unsuccessful_keys: [] }
Uploading... (4/7)
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
result: { successful_key_count: 1, unsuccessful_keys: [] }
Uploading... (5/7)
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
result: { successful_key_count: 2, unsuccessful_keys: [] }
Uploading... (7/7)
✨ Success! Uploaded 4 files (3 already uploaded) (0.99 sec)

-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/pages/assets/upsert-hashes
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
✨ Uploading Functions bundle
-- START CF API REQUEST: POST https://api.cloudflare.com/client/v4/accounts/3bfa1c299fec4bcadf683393bce8b53d/pages/projects/pasadena-equipment/deployments
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
BODY: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
🌎 Deploying...
attempt #1: Attempting to fetch status for deployment with id "b60570e4-3ea3-48a7-a31c-b458e404a0ee" ...
-- START CF API REQUEST: GET https://api.cloudflare.com/client/v4/accounts/3bfa1c299fec4bcadf683393bce8b53d/pages/projects/pasadena-equipment/deployments/b60570e4-3ea3-48a7-a31c-b458e404a0ee
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
attempt #2: Attempting to fetch status for deployment with id "b60570e4-3ea3-48a7-a31c-b458e404a0ee" ...
-- START CF API REQUEST: GET https://api.cloudflare.com/client/v4/accounts/3bfa1c299fec4bcadf683393bce8b53d/pages/projects/pasadena-equipment/deployments/b60570e4-3ea3-48a7-a31c-b458e404a0ee
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
✨ Deployment complete! Take a peek over at https://b60570e4.pasadena-equipment.pages.dev
-- START CF API REQUEST: GET https://api.cloudflare.com/client/v4/user
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
INIT: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API REQUEST
-- START CF API RESPONSE: OK 200
HEADERS: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
RESPONSE: omitted; set WRANGLER_LOG_SANITIZE=false to include sanitized data
-- END CF API RESPONSE
Metrics dispatcher: Dispatching disabled - would have sent {"type":"event","name":"create pages deployment","properties":{}}.
```
