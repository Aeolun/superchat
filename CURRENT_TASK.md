# Plan: Add Hash-Based Routing with @solidjs/router

## Goal
Persist navigation state in the URL hash so page reloads restore where the user was (channel, thread). Use `@solidjs/router` `HashRouter` properly rather than hand-rolling hash sync.

## Route Structure

```
#/                          → Channel list (no channel selected)
#/channel/:channelId        → Channel view (thread list for forum, chat for chat-type)
#/channel/:channelId/thread/:threadId  → Thread detail view (forum only)
```

Channel and thread IDs are database primary keys (autoincrement), so they're stable across connections.

## Architecture

### Key Insight
The app already has a single `App` component that conditionally renders based on store state. Rather than splitting into separate page components, we keep `App` as the `root` layout and use a **single catch-all route** that reads params and drives store state. The router becomes a URL<->state sync layer, not a component-switching mechanism.

### Approach: Route-aware wrapper component

1. **main.tsx** - Wrap render in `HashRouter` with `App` as root and routes
2. **New file: `src/lib/route-sync.ts`** - A `useRouteSync()` hook that:
   - **URL → State** (on load/navigation): Reads `useParams()` and triggers `handleJoinChannel`/`handleThreadClick` once connected and channel list is loaded
   - **State → URL** (on user interaction): Uses `useNavigate()` in a `createEffect` watching `activeChannelId` and `activeThreadId` to push URL updates
3. **App.tsx** - Call `useRouteSync()`, pass navigation callbacks to it

### Detailed Changes

#### 1. Install dependency
```bash
cd web-client && pnpm add @solidjs/router
```

#### 2. main.tsx
```tsx
import { render } from 'solid-js/web'
import { HashRouter, Route } from '@solidjs/router'
import './style.css'
import App from './App'

render(
  () => (
    <HashRouter root={App}>
      <Route path="/channel/:channelId/thread/:threadId" component={() => null} />
      <Route path="/channel/:channelId" component={() => null} />
      <Route path="/" component={() => null} />
    </HashRouter>
  ),
  document.getElementById('app')!
)
```

The route components are `() => null` because `App` (as `root`) does all rendering. The routes just provide params.

#### 3. src/lib/route-sync.ts (new)
Two-way sync hook:
- **URL → State**: On load, once connected + channels populated, read params and join the right channel/thread
- **State → URL**: Watch store.activeChannelId and store.activeThreadId, update URL accordingly
- Use `replace: true` for channel switches (don't bloat history), `push` for thread opens so back button works

#### 4. App.tsx changes
- `App` component signature changes to accept `props` with `children` (required by HashRouter root)
- Render `{props.children}` somewhere (it'll be null, but the router needs it)
- Call `useRouteSync()` in the component
- On disconnect, navigate to `/`
- The existing `handleJoinChannel`/`handleThreadClick`/`handleBackToThreadList` stay as-is

### Browser Back Button Behavior
- Thread detail → Thread list: back button works (thread open was a push)
- Channel switches: replace (back button doesn't cycle through channels)
- Disconnect: replace to `/`

### Edge Cases
- **Reload before channels load**: URL→State effect is gated on `isConnected() && channels().size > 0`
- **Invalid channel/thread ID**: If ID not in channel map after load, just stay at channel list
- **DM channels**: Same `/channel/:channelId` pattern since they have regular IDs
- **Disconnect**: Navigate to `/` (replace)

## Files to Modify
1. `web-client/package.json` - Add `@solidjs/router`
2. `web-client/src/main.tsx` - Wrap in `HashRouter`
3. `web-client/src/lib/route-sync.ts` - NEW: URL<->State sync hook
4. `web-client/src/App.tsx` - Accept `props.children`, call `useRouteSync()`, navigate on disconnect

## What We're NOT Changing
- Store architecture stays the same
- Protocol bridge stays the same
- All child components stay the same
- No component splitting (App remains monolithic for now)
