# Repository Guidelines

## Project Structure & Module Organization
- Next.js app centered in `src/app` (routes, providers) with shared UI in `src/components` and reusable hooks in `src/hooks`.
- Domain utilities live in `src/lib` (websocket provider, settings, zone config); shared types in `src/types`.
- Static assets sit in `public/`; environment examples in `env.example`; reference examples in `src/examples`.
- Tests are not yet established; new features should include the smallest viable checks (component or unit) alongside code.

## Build, Test, and Development Commands
- `npm run dev` — start the dev server on port 8082 using Turbopack.
- `npm run build` — production build (also honors port 8082 env in scripts).
- `npm start` — run the built app locally.
- `npm run lint` — run Next.js/ESLint rules; fix reported issues before committing.
- Create `.env.local` from `env.example` before running (set `NEXTAUTH_SECRET`, `NEXT_PUBLIC_WEBSOCKET_URL`).

## Coding Style & Naming Conventions
- TypeScript, strict mode; prefer function components with default exports and explicit prop types.
- Absolute imports via `@/` (e.g., `@/lib/utils`); kebab-case filenames.
- Formatting: single quotes, no semicolons; rely on ESLint (`eslint.config.mjs`) and Prettier defaults.
- Client components should declare `use client`; keep React state minimal and colocated.

## Testing Guidelines
- No dedicated test harness yet; when adding features, include lightweight component/unit tests using the project’s patterns where practical and ensure `npm run lint` passes.
- Mock WebSocket-dependent logic in tests to avoid live backend requirements.

## Commit & Pull Request Guidelines
- Commit messages are short and imperative (e.g., `Add login guard`, `Implement zone-based access control`); include ticket refs like `OPHMI-15` when applicable.
- PRs should describe the change, rationale, and validation steps; attach screenshots/GIFs for UI updates and note any config/env impacts.
- Keep changes scoped; prefer focused PRs over large mixed updates.

## Security & Configuration Tips
- Never commit secrets; use `.env.local` for local credentials and keep it out of version control.
- Validate auth- and websocket-related changes against expected URLs and zones before merging.
