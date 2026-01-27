## Stride Frontend

This is the React Native frontend for Stride, built with Expo and `expo-router`.

### Get started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Start the app**

   ```bash
   npx expo start
   ```

You can open the app in:

- **Expo Go** (quick device testing)
- **iOS simulator** / **Android emulator**
- A **development build** if you add native modules later

---

### File structure overview

```text
frontend/
├─ app/                         # App screens and navigation (expo-router)
│  ├─ _layout.tsx               # Root layout: wraps all routes in a Stack navigator
│  ├─ (auth)/                   # Auth-related routes (landing, login, reset flows)
│  │  ├─ _layout.tsx            # Auth stack layout (no tabs; auth-specific config)
│  │  └─ index.tsx              # Auth landing screen with "Sign in" button
│  └─ (tabs)/                   # Main app routes behind the tab bar
│     ├─ _layout.tsx            # Tabs layout: defines home/profile/settings tabs
│     ├─ home.tsx               # Home tab screen
│     ├─ profile.tsx            # Profile tab screen
│     └─ settings.tsx           # Settings tab screen
├─ assets/                      # Static assets bundled with the app
│  ├─ fonts/                    # Custom fonts (currently empty)
│  ├─ icons/                    # Vector or PNG icons (currently empty)
│  └─ images/                   # App images, logos, splash artwork
├─ components/                  # Reusable presentational and form components
│  ├─ Button/                   # Reusable button used on the landing screen
│  │  ├─ Button.tsx             # Button implementation (non-JSX React.createElement)
│  │  ├─ index.ts               # Barrel export for the Button component
│  │  └─ styles.ts              # Button-specific style helpers
│  ├─ Label/                    # Text label component
│  │  ├─ Label.tsx              # Label implementation
│  │  ├─ index.ts               # Barrel export for Label
│  │  └─ styles.ts              # Label-specific style helpers
│  └─ TextField/                # Input field component
│     ├─ TextField.tsx          # TextField implementation
│     ├─ index.ts               # Barrel export for TextField
│     └─ styles.ts              # TextField-specific style helpers
├─ hooks/                       # Custom React hooks (placeholder for app logic)
├─ services/                    # API clients and integration with backend services
├─ theme/                       # Design system tokens and theme utilities
│  ├─ colors.ts                 # Central color palette (brand, semantic colors)
│  ├─ radius.ts                 # Border radius scale
│  ├─ spacing.ts                # Spacing scale (margins/padding)
│  ├─ typography.ts             # Font sizes, weights, and text styles
│  └─ index.ts                  # Theme barrel exports / helpers
├─ types/                       # Shared TypeScript types and interfaces
├─ utils/                       # Small, pure utility functions and helpers
├─ app.json                     # Expo app configuration (name, icons, splash, etc.)
├─ eslint.config.js             # ESLint configuration
├─ expo-env.d.ts                # Expo environment type declarations
├─ package.json                 # Frontend dependencies and scripts
└─ tsconfig.json                # TypeScript configuration
```

---

### Core directories (detailed)

#### `app/`

The `app` directory is the heart of the frontend and uses **file-based routing** via `expo-router`.

- Each file in `app` becomes a **screen**.
- Folders wrapped in parentheses (like `(auth)` and `(tabs)`) are **route groups**:
  they organize screens without affecting the URL path.
- `_layout.tsx` files define **navigation layouts** (Stacks, Tabs, etc.) for their subtree.

In Stride:

- The **root** `_layout.tsx` wraps the entire app in a `Stack` navigator.
- `(auth)/` holds the **unauthenticated flow** (landing now, later login/forgot/reset).
- `(tabs)/` holds the **main tabbed experience** shown after "Sign in".

#### `assets/`

Static assets that ship with the app:

- **images/**: icons, logos, splash screens, and any other raster assets.
- **fonts/**: custom fonts to be loaded via `expo-font`.
- **icons/**: reusable icon assets (SVGs/PNGs) if you choose to add them.

Treat this as the single place for non-code resources to keep imports consistent and cacheable.

#### `components/`

Reusable building blocks for your UI:

- **Button/**: shared button used on the landing page and elsewhere.
- **Label/**: text labels that can be reused across forms and screens.
- **TextField/**: input components for forms and settings.

Each component folder typically contains:

- `*.tsx` – the implementation
- `styles.ts` – any style helpers specific to that component
- `index.ts` – a barrel file so imports stay clean (`import Button from "../components/Button"`).

Over time, this is where you'll add more UI primitives (cards, modals, lists, etc.).

#### `hooks/`

Custom React hooks live here, for example:

- `useAuth` – manage auth state and tokens.
- `useTheme` – read/update theme preferences (light/dark/system).
- `useDebouncedValue`, `usePaginatedQuery`, etc.

Keeping hooks in one place makes it easier to share logic across screens without bloating components.

#### `services/`

Integration points with external systems:

- HTTP clients for your backend (e.g., `apiClient`, `authService`).
- Analytics, logging, feature flags, or any other side-effectful services.

By routing all external calls through `services`, components and hooks stay focused on UI and state, not on networking details.

#### `theme/`

Your design system and visual tokens:

- `colors.ts` – brand palette and semantic colors (success, error, background, etc.).
- `spacing.ts` – a consistent spacing scale (`xs`, `sm`, `md`, etc.).
- `radius.ts` – a scale for rounded corners.
- `typography.ts` – font sizes, weights, and text presets.
- `index.ts` – a central export point and any helpers (e.g., `makeTextStyle`).

This keeps styling consistent and makes large-scale visual changes much easier.

#### `types/`

Project-wide TypeScript types and interfaces:

- Domain models (e.g., `User`, `Workout`, `Goal`).
- Shared enums/constants shapes.
- Response/request shapes for APIs (often in tandem with `services`).

Centralizing shared types reduces duplication and keeps contracts in one place.

---

---

### Why abstract components, assets, and themes?

Instead of defining styles, colors, and UI elements directly inside each screen, we organize them into dedicated directories. This approach makes the codebase easier to maintain and scale. When you need to change a button's appearance or update the brand color, you only update it in one place rather than hunting through dozens of files. Components become reusable building blocks that keep the UI consistent across the app, while centralized themes ensure that spacing, colors, and typography follow a cohesive design system. Assets are kept separate so they can be optimized, cached, and referenced consistently. As the app grows, this structure makes it much easier to find what you're looking for, test individual pieces, and make sweeping changes without breaking things.

---

### Learn more about Expo & Expo Router

To learn more about developing with Expo and `expo-router`, see:

- [Expo documentation](https://docs.expo.dev/)
- [Expo Router introduction](https://docs.expo.dev/router/introduction)
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/)

