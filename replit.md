# CP Tracker

## Overview

CP Tracker is a competitive programming practice tracker that helps users organize and monitor their problem-solving journey. Users can create practice sheets, add problems from platforms like Codeforces and AtCoder, track their solving status, and view progress analytics on a dashboard.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query (React Query) for server state management
- **Styling**: Tailwind CSS with shadcn/ui component library
- **Build Tool**: Vite for development and production builds
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed route definitions in `shared/routes.ts`
- **Authentication**: Passport.js with local strategy, session-based auth using express-session
- **Password Security**: scrypt hashing with timing-safe comparison

### Data Storage
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM with type-safe schema definitions
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Migrations**: Drizzle Kit for schema migrations (`db:push` command)

### Project Structure
```
├── client/           # React frontend
│   └── src/
│       ├── components/  # UI components (shadcn/ui based)
│       ├── hooks/       # Custom React hooks for data fetching
│       ├── pages/       # Route page components
│       └── lib/         # Utilities and query client
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route handlers
│   ├── storage.ts    # Database access layer
│   └── auth.ts       # Authentication setup
├── shared/           # Shared code between client/server
│   ├── schema.ts     # Drizzle database schema
│   └── routes.ts     # API route type definitions
```

### Key Design Patterns
- **Storage Interface**: `IStorage` interface in `server/storage.ts` abstracts database operations
- **Shared Types**: Schema types and route definitions shared between frontend and backend via `@shared` path alias
- **Type-Safe API**: Zod schemas define request/response types for all API endpoints

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: PostgreSQL session store for production

### UI Component Libraries
- **shadcn/ui**: Pre-built accessible components using Radix UI primitives
- **Radix UI**: Headless UI primitives for dialogs, dropdowns, tabs, etc.
- **Lucide React**: Icon library

### Data Visualization
- **Recharts**: Dashboard analytics charts

### File Processing
- **Multer**: File upload handling for bulk problem import
- **xlsx**: Excel file parsing for bulk uploads

### Development Tools
- **Vite**: Development server with HMR
- **esbuild**: Production build bundling for server
- **Drizzle Kit**: Database migration tooling