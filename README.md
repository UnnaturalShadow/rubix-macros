# Cube Controller

Turn a Rubik’s Connected Bluetooth cube into a macro controller for macOS and Windows. The existing Vite/TypeScript interface, cube protocol library, profiles, move recording, and sequence matcher run inside Electron. Actions run through a validated preload/IPC boundary instead of an Express server.

The application is in [`cube-controller`](cube-controller). See its [README](cube-controller/README.md) for setup, transferring existing profiles, permissions, builds, and hardware verification.
