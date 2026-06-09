# Medieval Realm

A solo-built medieval RTS game developed with **React**, **Three.js**, and **TypeScript** — built entirely through AI-assisted development using **Augment Code**.


## About

Medieval Realm is a browser-based real-time strategy game inspired by classics like Age of Empires. Manage resources, construct buildings, train units, and defend your settlement against enemy raids — all rendered in 3D directly in the browser.

This project was built as an experiment in AI-assisted game development, using Augment Code as the primary development partner throughout the entire process — from architecture decisions to system implementation.

## Features

- **3D RTS gameplay** powered by Three.js and React Three Fiber
- **ECS architecture** (Entity Component System) for clean, scalable game logic
- **Resource management** — Wood, Food, Stone, Population
- **Building system** — Houses, Barracks, Farms, Markets, Strongholds and more
- **Military system** — Unit training, formation movement, combat
- **Enemy AI** — Raid system with faction-based enemy behavior
- **Technology tree** — Research upgrades across multiple disciplines
- **Trade system** — Economy and inter-faction trading
- **Day/night cycle** — Time-based gameplay events
- **Save system** — Persistent game state
- **Random events** — Dynamic gameplay variety
- **Minimap** — Real-time world overview

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + TypeScript |
| 3D Rendering | Three.js + React Three Fiber |
| Post-processing | @react-three/postprocessing |
| UI Components | Radix UI + shadcn/ui |
| Styling | Tailwind CSS |
| State Management | Custom ECS + EventBus |
| Build Tool | Vite |
| Testing | Vitest |

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
git clone https://github.com/YOUR_USERNAME/medieval-realm
cd medieval-realm
npm install
npm run dev
```

Open `http://localhost:8080` in your browser.

### Controls

| Action | Control |
|---|---|
| Select unit/building | Left click |
| Move / Command | Right click |
| Force menu | Shift + Right click |
| Camera pan | Arrow keys / WASD |
| Camera zoom | Scroll wheel |

## Development

```bash
npm run dev        # Start development server
npm run build      # Production build
npm run test       # Run tests
npm run lint       # Lint codebase
```

## Built with Augment Code

This entire project was developed using [Augment Code](https://www.augmentcode.com/) as the AI development partner. Augment's Context Engine maintained awareness of the full codebase throughout development — from the initial ECS architecture through to the combat, economy, and rendering systems.

The workflow: describe a system in natural language → Augment understands the existing architecture → implementation fits cleanly into the codebase without breaking existing systems.

Currently exploring what [Cosmos](https://www.augmentcode.com/#meet-cosmos) — Augment's agentic SDLC platform — can do with an existing complex codebase: automated audits, rendering diagnostics, and live feature implementation.

## Project Status

Active experiment. Known areas for improvement:
- Terrain system (currently fixed plane, infinite world in progress)
- Rendering quality optimization
- Additional unit types and animations

## License

MIT
