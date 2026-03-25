# claude-plugin-imessage

iMessage channel plugin for Claude — send and receive messages via iMessage on macOS.

## How it works

1. **Reads** incoming messages by polling the local `~/Library/Messages/chat.db` SQLite database
2. **Processes** each message through a configurable handler (e.g. Claude)
3. **Sends** replies back via AppleScript through the Messages app

## Requirements

- macOS with Messages app configured for iMessage
- Full Disk Access granted to your terminal (System Settings > Privacy & Security > Full Disk Access)
- Node.js >= 20

## Setup

```bash
npm install
npm run build
```

## Usage

```bash
# Run with defaults (polls every 2s, processes all senders)
npm start

# Configure via environment variables
POLL_INTERVAL_MS=5000 ALLOWED_SENDERS="+15551234567,friend@icloud.com" npm start
```

### As a library

```typescript
import { IMessageChannel } from "claude-plugin-imessage";

const channel = new IMessageChannel({
  pollIntervalMs: 2000,
  allowedSenders: ["+15551234567"],
});

channel.onMessage(async (msg) => {
  // Process with Claude or any other handler
  return `You said: ${msg.text}`;
});

channel.start();
```

## Configuration

| Option | Env Var | Default | Description |
|--------|---------|---------|-------------|
| `dbPath` | — | `~/Library/Messages/chat.db` | Path to iMessage database |
| `pollIntervalMs` | `POLL_INTERVAL_MS` | `2000` | Poll interval in ms (min 500) |
| `allowedSenders` | `ALLOWED_SENDERS` | `[]` (all) | Comma-separated phone/email filter |
| `lookbackSeconds` | `LOOKBACK_SECONDS` | `60` | Process messages this old at startup |

## Testing

```bash
npm test
```
