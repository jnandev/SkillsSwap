# SkillSwap

Premium-style SkillSwap mobile/web experience built with Expo + React Native and a local Express backend.

## Features

- Auth flow: register, login, persisted session token
- Mandatory profile onboarding + editable profile tab
- Discover teachers/learners with search, category/persona filters
- Connect + favorite listings
- Live session booking modal with lifecycle states (`upcoming`, `live`, `completed`)
- Calendar export (`.ics`) per session
- Community events and join actions
- Notifications center
- Message threads with replies
- Learning plan progress tracking
- Real-time polling (messages/notifications/threads refresh every 10s)

## Tech Stack

- Frontend: Expo, React Native, TypeScript
- Backend: Node.js, Express, JSON file persistence

## Prerequisites

- Node.js 18+ (LTS recommended)
- npm

## Install

```bash
npm install
```

## Quick Start (All Platforms)

Open **two terminals** in the project folder.

### Terminal 1: Backend API

```bash
npm run backend
```

Backend runs at `http://localhost:4000`.

### Terminal 2: Expo App

```bash
npm start
```

From Expo terminal:

- Press `a` to launch Android emulator
- Press `i` to launch iOS simulator (macOS only)
- Scan QR with Expo Go (physical device)

## Windows: Full Mobile Setup

### 1) Install required tools

- Install Node.js LTS: [https://nodejs.org](https://nodejs.org)
- Install Git: [https://git-scm.com](https://git-scm.com)
- Install Android Studio: [https://developer.android.com/studio](https://developer.android.com/studio)
- Install Expo Go on your Android phone from Play Store (optional, for physical device testing)

### 2) Setup Android Studio emulator

- Open Android Studio
- Go to **More Actions > Virtual Device Manager**
- Create a virtual device (for example Pixel 6)
- Download a system image (recommended latest stable API)
- Start the emulator once to verify it boots

### 3) Configure environment variables (Windows)

Add these to **System Environment Variables**:

- `ANDROID_HOME` = `C:\Users\<YourUser>\AppData\Local\Android\Sdk`
- Add to `Path`:
  - `%ANDROID_HOME%\platform-tools`
  - `%ANDROID_HOME%\emulator`

Restart terminal after updating environment variables.

### 4) Run SkillSwap on Windows

In project folder, open two terminals:

Terminal 1:

```bash
npm run backend
```

Terminal 2:

```bash
npm start
```

Then:

- Press `a` in Expo terminal to open Android emulator app
- Or scan QR from Expo terminal in Expo Go on phone (same Wi-Fi network)

## macOS Mobile Setup (if needed)

- iOS Simulator requires Xcode installed from App Store
- Start backend: `npm run backend`
- Start Expo: `npm start`
- Press `i` for iOS simulator or `a` for Android emulator

## Run Web Version

```bash
npx expo start --web --port 8085
```

Open: `http://localhost:8085`

## Demo Login

- Email: `demo@skillsswap.app`
- Password: `demo123`

## Type Check

```bash
npx tsc --noEmit
```

## Project Scripts

- `npm run backend` - starts Express backend
- `npm run web` - starts Expo web (default port behavior)
- `npm start` - starts Expo dev server
- `npm run ios` - starts Expo for iOS
- `npm run android` - starts Expo for Android

## Troubleshooting

- If Expo asks for another port, accept it or run:
  - `npx expo start --port 8086`
- If backend is not reachable, verify `npm run backend` is still running
- If emulator is not detected on Windows:
  - start emulator manually from Android Studio first
  - then press `a` in Expo terminal
