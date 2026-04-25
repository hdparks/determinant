# @determinant/web

React-based web UI for the Determinant task management system.

## Features

- 📋 Task list with state filtering (Proposal, Questions, Research, Plan, Implement, Validate, Released)
- 📊 Task detail view with workflow history and artifacts
- 🎯 Priority queue visualization by state
- 🔄 Real-time updates via polling (5s for lists, 3s for details)
- 🎨 Responsive design with Tailwind CSS
- ⚡ Fast performance with React Query caching

## Technology Stack

- **React 18** with TypeScript
- **Vite** for fast builds and HMR
- **Tailwind CSS** for styling
- **TanStack Query** (React Query) for data fetching and caching
- **React Router** for client-side routing

## Development

### Prerequisites

The API server must be running on port 10110:

```bash
# From repository root
npm run dev:server
```

### Start Dev Server

```bash
npm run dev
```

Runs Vite dev server on http://localhost:5173 with:
- Hot Module Replacement (HMR)
- API proxy to http://localhost:10110
- Fast refresh for instant updates

### Project Structure

```
src/
├── components/        # Reusable UI components
├── hooks/            # Custom React hooks (useTask, useTasks)
├── lib/              # Utilities (api-client, cn)
├── pages/            # Route components
├── App.tsx           # Root component with routing
└── main.tsx          # Application entry point
```

## Build

### Production Build

```bash
npm run build
```

Creates optimized production build in `dist/`:

- ✅ Minified and tree-shaken JavaScript
- ✅ Optimized CSS with unused styles removed
- ✅ Content-hashed filenames for long-term caching
- ✅ Code splitting (separate chunks for React, React Query)
- ✅ Source maps for debugging

**Build output:**
```
dist/
├── index.html
├── assets/
│   ├── index-[hash].js
│   ├── react-vendor-[hash].js
│   ├── query-vendor-[hash].js
│   └── index-[hash].css
└── *.svg (icons, favicon)
```

### Preview Production Build

```bash
npm run preview
```

Serves the production build locally for testing.

## Environment Variables

### Development Configuration

Create `packages/web/.env.development`:

```bash
VITE_DETERMINANT_SERVER_URL=http://localhost:10110
```

This allows the dev server to connect to the local API server.

### Production Configuration

Create `packages/web/.env.production`:

**For merged deployment (same origin):**
```bash
VITE_DETERMINANT_SERVER_URL=
```

Empty string makes the API client use relative URLs (e.g., `/api/tasks` instead of `http://localhost:10110/api/tasks`).

**For separate deployment (CDN/static hosting):**
```bash
VITE_DETERMINANT_SERVER_URL=https://api.example.com
```

Points to your deployed API server.

## Deployment

### Option 1: Merged Deployment (Recommended)

Serve web UI from the same Express server as the API:

```bash
# From repository root
npm run build
npm start
```

Access at http://localhost:10110

**Benefits:**
- Single process to manage
- No CORS configuration needed
- Simplified deployment
- Lower infrastructure costs

See `packages/server/README.md` for server deployment details.

### Option 2: Separate Deployment

Deploy web UI to static hosting (Netlify, Vercel, Cloudflare Pages, AWS S3, etc.):

**Build:**
```bash
npm run build
```

**Deploy:**
Upload the entire `dist/` directory to your hosting provider.

**Configure:**
- Set `VITE_DETERMINANT_SERVER_URL` to your API server URL
- Configure CORS on API server to allow your web domain

**Example with Netlify:**
```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy --dir=dist --prod
```

**Example with Vercel:**
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

## API Integration

The web UI connects to the API using `packages/web/src/lib/api-client.ts`.

**Key endpoints used:**
- `GET /api/tasks` - List tasks
- `GET /api/tasks/:id` - Get task details with workflow nodes
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id/state` - Update task state
- `PATCH /api/tasks/:id/priority` - Update priority
- `GET /api/queue/:state` - Get priority queue

**Polling intervals:**
- Task list: 5 seconds
- Individual task: 3 seconds

Future enhancement: Server-Sent Events (SSE) will replace polling for real-time updates.

## Browser Support

- Chrome, Edge, Safari, Firefox (last 2 versions)
- ES2020+ features required
- Modern JavaScript (no IE11 support)

## Development Tips

### Proxy Configuration

API requests are proxied in development via `vite.config.ts`:

```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:10110',
      changeOrigin: true
    }
  }
}
```

This allows seamless API calls without CORS issues during development.

### React Query DevTools

React Query DevTools are available in development for debugging:

Press **Ctrl+Shift+D** (or **Cmd+Shift+D** on Mac) to toggle the DevTools panel.

### Type Safety

The web package uses types from `@determinant/types` for full type safety across the stack.

## Troubleshooting

### "Failed to fetch" errors

**Cause:** API server not running or wrong URL

**Solution:**
1. Ensure server is running: `npm run dev:server` (from root)
2. Check `VITE_DETERMINANT_SERVER_URL` in `.env.development`
3. Verify server is accessible at http://localhost:10110/api/health

### Build errors with TypeScript

**Cause:** Type mismatches or outdated types

**Solution:**
```bash
# Rebuild types package
npm run build -w packages/types

# Then rebuild web
npm run build -w packages/web
```

### Stale data in UI

**Cause:** React Query cache not invalidating

**Solution:** Clear browser cache or adjust polling intervals in `src/hooks/use-tasks.ts`

## License

MIT
