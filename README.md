# Float Liner

FLOAT Substrate #14 - blocks-based outliner with PlateJS v52+ and Tauri v2.

## What This Is

A consciousness technology outliner prototype exploring:
- **Blocks-based editing** via PlateJS (rich text, code blocks, lists)
- **Tree hierarchy** for implicit argument passing (templated doors pattern)
- **Tauri v2** desktop app with file system access
- **Zustand + Yjs** for state management and potential CRDT sync

## Design Insights

### Templated Doors (Tree Inheritance)

See `docs/DESIGN-templated-doors.md` - parent blocks become implicit arguments:

```
boards::
  consciousness-tech::
    read:: 47        ← knows it's consciousness-tech/47
```

Less typing, same semantics. The tree IS the scope.

## Stack

- React 19 + TypeScript
- PlateJS v52 (Slate-based rich text)
- Tauri v2 (Rust backend)
- TailwindCSS v4
- Zustand + Yjs

## Commands

```bash
npm install           # Install dependencies
npm run dev           # Start Vite dev server
npx tauri dev         # Run full Tauri app
npx tauri build       # Build distributable
```

## Project Structure

```
src/
├── App.tsx           # Root component
├── components/       # React components
├── hooks/            # Custom hooks
├── lib/              # Utilities
└── styles/           # CSS

src-tauri/
└── src/lib.rs        # Tauri commands

docs/
└── DESIGN-*.md       # Design documents
```

## Status

Weekend prototype. Connected to Float BBS substrate experiments.

---

*Part of the float-substrate consciousness technology laboratory*
