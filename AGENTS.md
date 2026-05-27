# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Development Commands

### Full Stack
- Develop (Server & Client): `npm run dev`
- Build: `npm run build`
- Start Production: `npm start`

### Client
- Dev: `npm run dev -w client`
- Build: `npm run build -w client`
- Preview: `npm run preview -w client`

### Server
- Dev: `npm run dev -w server`
- Build: `npm run build -w server`
- Start: `npm run start -w server`

## Architecture Overview

The project is a monorepo containing a React frontend and a Node.js backend.

### Client (Frontend)
- **Framework**: React 19 with Vite and TypeScript.
- **Styling**: Tailwind CSS 4.
- **Routing**: React Router 7.
- **State/Context**: Uses a `ThemeContext` for application-wide theme management.
- **Structure**:
  - `src/pages`: Page-level components (Home, Collections, Settings, etc.).
  - `src/components`: Reusable UI components.
  - `src/api.ts`: Client-side API communication logic.

### Server (Backend)
- **Framework**: Express.js.
- **Database**: SQLite (using `sql.js`).
- **Runtime**: Node.js (ES Modules).
- **Migrations**: Custom migration system located in `src/db/migrations`.
- **Structure**:
  - `src/index.ts`: Entry point, initializes DB and runs migrations.
  - `src/app.ts`: Express application configuration and middleware.
  - `src/db/`: Database connection and migration logic.

### Data Storage
- The application uses a local SQLite database located at `data/reely.db`.
