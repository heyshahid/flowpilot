# FlowPilot OAuth 2.0 & Third-Party Connection Guide

## 1. Google Workspace & Google Sheets
1. Navigate to Google Cloud Console > APIs & Services > Credentials.
2. Create an **OAuth 2.0 Client ID** (Web application).
3. Set Authorized Redirect URI:
   `https://<your-flowpilot-domain>/api/v1/integrations/google_sheets/callback`
4. Add Scopes:
   `https://www.googleapis.com/auth/spreadsheets`
5. Store client ID and secret in your `.env` or in the FlowPilot Credential Vault.

## 2. Slack App Configuration
1. Open https://api.slack.com/apps and create a new App.
2. In **OAuth & Permissions**, add Bot Token Scopes:
   - `chat:write`
   - `channels:read`
3. Install to Workspace and copy the `xoxb-...` Bot User OAuth Token.
4. Save in FlowPilot under `/credentials` or `/integrations`.

## 3. Telegram Bot Setup
1. Chat with `@BotFather` on Telegram.
2. Run `/newbot` to create your automation bot.
3. Copy the HTTP API token (`<bot_id>:<alphanumeric_secret>`).
4. Paste the token into FlowPilot's Telegram Connector.
