# Contributing

Thanks for helping improve Outlook Notifier.

## Development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure Microsoft authentication:

   ```bash
   cp .env.example .env
   ```

   Then replace `AZURE_CLIENT_ID` with your Azure app registration client ID.

3. Run the app:

   ```bash
   npm run dev
   ```

## Quality checks

Before opening a pull request, run:

```bash
npm run typecheck
npm run build
```

## Pull requests

Keep changes focused, describe user-facing behavior clearly, and include tests when changing sync, auth, IPC, storage, or notification behavior.
