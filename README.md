# ATHENA independent news website

Start with [START-HERE.md](START-HERE.md). Deployment and maintenance instructions are in [DEPLOYMENT.md](DEPLOYMENT.md).

Node.js 24.19+ (24.x). No npm dependencies. Local setup: `cp .env.example .env`, `npm run setup -- YOUR_EMAIL`, then `npm start`.

Run `npm test` for HTTP integration tests. The application uses its own password login, local SQLite database and disk image uploads. It has no runtime dependency on ChatGPT, Sites or Canva.
