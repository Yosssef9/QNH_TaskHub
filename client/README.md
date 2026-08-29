# QNH TaskHub client

Arabic-first React frontend for QNH TaskHub. The application uses QNH Portal authentication and provides private task lists and configurable KPIs.

## Technology

- React 19, TypeScript, and Vite
- React Router and TanStack Query
- React Hook Form and Zod
- Tailwind CSS with semantic design tokens
- Radix UI behavior with local reusable UI components
- i18next for Arabic/English localization
- React Hot Toast for temporary feedback
- Vitest, Testing Library, and Playwright

## Commands

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

The Vite development server proxies `/api` to `http://localhost:3000`.

## Frontend organization

```text
src/
├── app/          Application composition, providers, router, and layouts
├── components/   Shared application components and UI primitives
├── config/       Environment and navigation configuration
├── features/     Business features with their API, hooks, types, and components
├── hooks/        Generic reusable hooks
├── i18n/         Localization setup and Arabic/English resources
├── lib/          Generic clients and utilities
├── pages/        Route-level composition only
└── types/        Shared API contracts
```

Pages compose layouts and feature components. API calls belong in feature API modules, server state belongs in TanStack Query hooks, and business calculations remain authoritative on the backend.

## Design and localization

- Arabic is the default language and uses RTL layout.
- English uses LTR layout.
- Light, dark, and system themes are supported.
- Colors use semantic CSS tokens from `src/index.css`; feature code should not introduce arbitrary colors.
- The desktop sidebar collapses to accessible icon navigation. Mobile navigation uses an accessible drawer.

Theme, language, and sidebar preferences are stored locally during the foundation phase. They will synchronize with authenticated `TM_user_settings` during the access phase.

## Environment

Copy `.env.example` to `.env` for local overrides. Never commit Portal tokens, secrets, or credentials.
