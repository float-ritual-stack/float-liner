# Project knowledge

FLOAT Substrate #14 - blocks-based outliner with PlateJS v52+ and Tauri v2. A consciousness technology prototype exploring blocks-based editing with tree hierarchy for implicit argument passing.

## Quickstart
- Setup: `npm install` or `bun install`
- Dev (web only): `npm run dev`
- Dev (Tauri app): `npx tauri dev`
- Build: `npx tauri build`
- Typecheck: `tsc`

## Architecture
- Key directories:
  - `src/` - React frontend (components, hooks, lib)
  - `src/components/` - React components (Pane, BlockItem, PlateBlock, VirtualBlockList)
  - `src/hooks/` - Zustand stores (useBlockStore, usePaneStore) and Yjs sync
  - `src/lib/` - Types and utilities
  - `src-tauri/` - Rust backend (Tauri v2 commands)
  - `docs/` - Design documents

- Data flow: Zustand stores → React components → PlateJS editors → Yjs CRDT sync

## Stack
- React 19 + TypeScript (strict mode)
- PlateJS v52 (Slate-based rich text)
- Tauri v2 (Rust backend with yrs for CRDTs)
- TailwindCSS v4
- Zustand + Yjs

## Conventions
- Formatting/linting: TypeScript strict mode enabled
- Patterns to follow:
  - Use Zustand for state management
  - PlateJS for rich text editing
  - Templated doors pattern for tree inheritance (see `docs/DESIGN-templated-doors.md`)
- Things to avoid:
  - Don't cast as `any`
  - Keep components focused and composable
