# SyncTunes — Implementation Tasks

Tasks are ordered for sequential execution. Each task is atomic and buildable on top of the previous. Mark tasks complete as you go.

---

## Phase 0 — Project Scaffold

### T-01: Root workspace setup
- Create root `.gitignore` covering `node_modules`, `.env`, `dist`, `build`
- Create root `README.md` with setup instructions

### T-02: Backend project init
- `mkdir server && cd server && npm init -y`
- Install production deps:
  `express socket.io mongoose bcryptjs jsonwebtoken dotenv cors multer cloudinary`
- Install dev deps:
  `nodemon`
- Add `"dev": "nodemon src/index.js"` and `"start": "node src/index.js"` scripts
- Create `server/.env.example` (see design.md §11)
- Create directory tree: `src/{config,models,middleware,routes,controllers,socket,utils}/`

### T-03: Frontend project init
- `cd client && npm create vite@latest . -- --template react`
- Install deps:
  `axios socket.io-client zustand react-router-dom`
- Remove Vite boilerplate (App.css, assets/react.svg, counter logic)
- Create `client/.env.example`
- Create directory tree: `src/{api,socket,stores,hooks,pages,components}/`

---

## Phase 1 — Backend Foundation

### T-04: Database connection (`server/src/config/db.js`)
- Export async `connectDB()` that calls `mongoose.connect(process.env.MONGO_URI)`
- Log success or exit process on failure

### T-05: Cloudinary config (`server/src/config/cloudinary.js`)
- Import `cloudinary` v2 SDK
- Call `cloudinary.config({ cloud_name, api_key, api_secret })` from env
- Export configured `cloudinary` instance

### T-06: Entry point (`server/src/index.js`)
- Load `dotenv`
- Create Express app; attach `cors({ origin: CLIENT_ORIGIN, credentials: true })`
- `express.json()` body parser
- Mount REST routes: `/api/auth`, `/api/rooms`, `/api/tracks`
- Create `http.Server` wrapping Express
- Initialize Socket.io on the http server (see T-17)
- Call `connectDB()` then `server.listen(PORT)`

### T-07: User model (`server/src/models/User.js`)
- Fields: `username` (unique, 3–30), `email` (unique, lowercase), `passwordHash`, `createdAt`
- Pre-save hook NOT needed — hashing handled in controller
- Export `User`

### T-08: Room model (`server/src/models/Room.js`)
- Fields per design.md §3.2
- Default values: `isPrivate: false`, `memberIds: []`, `actionSequence: 0`, `playbackState: { isPlaying: false, startedAtServerTime: 0, pausedAtOffsetMs: 0 }`
- Index: `joinCode` (unique)
- Export `Room`

### T-09: Track model (`server/src/models/Track.js`)
- Fields per design.md §3.3
- Index: `roomId`
- Export `Track`

### T-10: Auth middleware (`server/src/middleware/auth.js`)
- Extract `Authorization: Bearer <token>` header
- `jwt.verify(token, JWT_SECRET)` → attach to `req.user`
- Return 401 on missing/invalid token
- Export `protect`

### T-11: Upload middleware (`server/src/middleware/upload.js`)
- `multer({ storage: memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } })`
- `fileFilter`: accept only `audio/mpeg`, `audio/wav`, `audio/x-m4a`, `audio/mp4`; reject others with 400
- Export `uploadAudio` (single field `"audio"`)

### T-12: Join code utility (`server/src/utils/joinCode.js`)
- Export `generateJoinCode()` → random 6-char string `[A-Z0-9]`

---

## Phase 2 — REST API

### T-13: Auth controller + routes
**Controller** (`server/src/controllers/authController.js`):
- `register`: validate body, check duplicates, `bcrypt.hash(password, 12)`, save User, sign JWT, return `{ token, user }`
- `login`: find by email, `bcrypt.compare`, sign JWT, return `{ token, user }`

**Routes** (`server/src/routes/auth.js`):
- `POST /register` → `register`
- `POST /login` → `login`

### T-14: Room controller + routes
**Controller** (`server/src/controllers/roomController.js`):
- `createRoom`: generate joinCode, create Room, return room
- `listRooms`: return public rooms, paginated
- `getRoom`: return room if public or requester is member
- `renameRoom`: host only, update name
- `deleteRoom`: host only — see cascade delete in design.md §8; use `Promise.allSettled` for Cloudinary deletes
- `joinRoom`: by joinCode — add to memberIds if < 20, else 409
- `kickMember`: host only, remove from memberIds, emit `room:kicked` via socket

**Routes** (`server/src/routes/rooms.js`):
- `GET /` → `listRooms`
- `POST /` → `createRoom`
- `GET /:id` → `getRoom`
- `PATCH /:id` → `renameRoom`
- `DELETE /:id` → `deleteRoom`
- `POST /join` → `joinRoom`
- `POST /:id/kick` → `kickMember`

### T-15: Track controller + routes
**Controller** (`server/src/controllers/trackController.js`):
- `uploadTrack`: pipe `req.file.buffer` through `cloudinary.uploader.upload_stream` with `{ resource_type: 'video', folder: 'synctunes/tracks' }`, save Track doc, return track
- `listTracks`: member-only, return tracks for roomId
- `deleteTrack`: uploader or host — `cloudinary.uploader.destroy(publicId, { resource_type: 'video' })`, delete doc; handle partial failure with 207

**Routes** (`server/src/routes/tracks.js`):
- `GET /rooms/:roomId/tracks` → `listTracks`
- `POST /rooms/:roomId/tracks` → `uploadAudio` middleware → `uploadTrack`
- `DELETE /tracks/:id` → `deleteTrack`

---

## Phase 3 — Socket.io Server

### T-16: Socket.io auth middleware (`server/src/socket/index.js`)
- On `io.use(...)`: extract `socket.handshake.auth.token`, verify JWT, attach to `socket.data.user`
- Reject unauthenticated connections

### T-17: Socket.io server init (`server/src/socket/index.js`)
- Initialize in-memory room cache: `const roomCache = new Map()` — structure: `{ playbackState, actionSequence, currentTrackId, memberIds }`
- Helper `getRoomState(roomId)`: returns cache entry; on miss, loads from DB and populates cache
- Export `initSocket(httpServer)` that creates `io`, attaches middleware, registers connection handler
- On `connection`: register room and playback handlers

### T-18: Room socket handlers (`server/src/socket/roomHandlers.js`)
- `room:join`:
  1. Verify user is member of room (or add them — coordinated with REST join)
  2. Socket joins Socket.io room channel `room:<roomId>`
  3. Run clock sync setup for the client
  4. Emit `room:state` to the joining socket (full state from cache/DB)
  5. Broadcast `room:memberUpdate` to room channel
- `room:leave`:
  1. Socket leaves channel
  2. Remove from memberIds (cache + DB)
  3. Broadcast `room:memberUpdate`
- `disconnect`:
  1. For each room the socket was in, treat as leave after 5s grace period (use `setTimeout` keyed by `socket.id`; cancel if socket reconnects before timeout fires)
- `clock:sync`:
  - Receive `{ clientTime }`, immediately respond with `{ clientTime, serverTime: Date.now() }`

### T-19: Playback socket handlers (`server/src/socket/playbackHandlers.js`)
Implement all handlers described in design.md §6.1. Key rules for every handler:
- Read from in-memory cache (synchronous)
- actionSequence check (synchronous, no await between check and increment)
- Mutate cache
- Persist to DB (async, `room.save()` called but not awaited before broadcast)
- Broadcast `playback:update` to `room:<roomId>`

Handlers to implement:
- `playback:play`
- `playback:pause`
- `playback:seek`
- `playback:trackChange`
- `playback:heartbeat` → unicast `playback:heartbeatResponse` to requesting socket only

---

## Phase 4 — Frontend Foundation

### T-20: Axios instance (`client/src/api/axios.js`)
- `axios.create({ baseURL: VITE_API_URL })`
- Request interceptor: attach `Authorization: Bearer <token>` from authStore
- Response interceptor: on 401, call `authStore.logout()` and redirect to `/login`

### T-21: Socket singleton (`client/src/socket/socket.js`)
- `io(VITE_SOCKET_URL, { autoConnect: false, auth: { token } })`
- Export `socket`
- Export `connectSocket(token)` — sets `socket.auth.token`, calls `socket.connect()`
- Export `disconnectSocket()`

### T-22: Zustand stores
- **authStore** (`client/src/stores/authStore.js`): `{ user, token, login, logout }` — persisted with `zustand/middleware`'s `persist` to `localStorage` key `"synctunes-auth"`
- **roomStore** (`client/src/stores/roomStore.js`): `{ currentRoom, members, tracks, setRoom, setMembers, setTracks, addTrack, removeTrack, clearRoom }`
- **playerStore** (`client/src/stores/playerStore.js`): `{ playbackState, actionSequence, currentTrackId, serverTimeOffset, applyPlaybackUpdate, setClockOffset }`

### T-23: App router (`client/src/App.jsx`)
- `BrowserRouter` with routes:
  - `/login` → `LoginPage`
  - `/register` → `RegisterPage`
  - `/` → `ProtectedRoute` → `LobbyPage`
  - `/room/:id` → `ProtectedRoute` → `RoomPage`
- `ProtectedRoute`: redirects to `/login` if no token in authStore

---

## Phase 5 — Frontend Pages & Components

### T-24: Auth pages
**LoginPage** (`client/src/pages/LoginPage.jsx`):
- Form: email, password
- POST `/auth/login` via axios
- On success: `authStore.login(user, token)`, `connectSocket(token)`, navigate `/`

**RegisterPage** (`client/src/pages/RegisterPage.jsx`):
- Form: username, email, password (min 8 chars)
- POST `/auth/register`
- On success: same as login flow

Both pages: show inline field-level errors from API response; disable submit while loading.

### T-25: LobbyPage (`client/src/pages/LobbyPage.jsx`)
- Fetch and display public rooms list (`GET /rooms`)
- "Create Room" modal: name field + private toggle
- "Join by code" input: POST `/rooms/join` with joinCode
- Click room card → navigate `/room/:id`
- Show current user chip + logout button in header

### T-26: RoomHeader component (`client/src/components/RoomHeader.jsx`)
- Display room name, join code (copy-to-clipboard button)
- Host controls: rename room button (inline edit), delete room button (confirm dialog)
- Leave room button (for all members)

### T-27: MemberList component (`client/src/components/MemberList.jsx`)
- Render `roomStore.members` list with username
- Host badge on host user
- Host sees kick button next to each non-host member

### T-28: TrackList component (`client/src/components/TrackList.jsx`)
- Render `roomStore.tracks`
- Each row: title, artist, duration
- Highlight currently playing track
- Click track → emit `playback:trackChange` (include current actionSequence)
- Uploader or host sees delete button per track

### T-29: TrackUpload component (`client/src/components/TrackUpload.jsx`)
- File input accepting `.mp3,.wav,.m4a`
- Title + artist text fields
- Client-side size check (15 MB) before submit
- POST multipart to `/rooms/:roomId/tracks` with progress indicator
- On success: `roomStore.addTrack(track)`
- Show error message on 400 (format/size rejection)

### T-30: AudioPlayer component (`client/src/components/AudioPlayer.jsx`)
- HTML5 `<audio ref={audioRef}>` with `src` set to `currentTrack.cloudinaryUrl`
- Play/Pause button → emit `playback:play` or `playback:pause` with current actionSequence
- Seek bar (range input) → on `mouseup`/`touchend` emit `playback:seek` with positionMs
- Current time / duration display (MM:SS)
- Volume control
- On `playback:update` from socket: apply new play/pause state, correct `currentTime` if drift > 300ms
- On `room:staleAction`: apply corrected state from payload

### T-31: useClockSync hook (`client/src/hooks/useClockSync.js`)
- Emits `clock:sync` on mount and every 30s
- On `clock:syncResponse`, computes `serverTimeOffset`, calls `playerStore.setClockOffset`
- Returns `serverTimeOffset`

### T-32: useDriftCorrection hook (`client/src/hooks/useDriftCorrection.js`)
- Runs only when `isPlaying === true`
- `setInterval(5000)` → emit `playback:heartbeat`
- On `playback:heartbeatResponse`: compute authoritative position using `getAuthorisedPositionMs`, compare to `audioRef.current.currentTime * 1000`, seek if |diff| > 300ms
- Cleans up interval on unmount or when playback stops

### T-33: RoomPage integration (`client/src/pages/RoomPage.jsx`)
- On mount: `socket.emit('room:join', { roomId })`, load tracks via `GET /rooms/:roomId/tracks`
- On unmount: `socket.emit('room:leave', { roomId })`, `roomStore.clearRoom()`
- Register all socket listeners: `room:state`, `room:memberUpdate`, `room:kicked`, `playback:update`, `room:staleAction`
- Remove listeners on unmount (avoid duplicate registration on re-render)
- Compose: `RoomHeader`, `MemberList`, `TrackList`, `TrackUpload`, `AudioPlayer`
- Use `useClockSync` and `useDriftCorrection` hooks

---

## Phase 6 — Config & Build Verification

### T-34: Environment files
- `server/.env.example` — all vars from design.md §11
- `client/.env.example` — all vars from design.md §11
- Both `.env` files in `.gitignore`

### T-35: Vite proxy config (`client/vite.config.js`)
- Add `server.proxy` for `/api` → `http://localhost:4000` and `/socket.io` → `http://localhost:4000`
  (so the client dev server proxies to the backend; avoids CORS in local dev)

### T-36: Build verification
- `cd server && npm install` — verify zero peer dep errors
- `cd client && npm install` — verify zero peer dep errors
- `cd client && npm run build` — verify Vite builds without errors
- `cd server && node src/index.js` — verify server starts and connects to MongoDB (requires `.env`)
- Smoke-test: register a user, create a room, confirm socket connection

---

## Implementation Order Summary

```
T-01 → T-02 → T-03           # scaffold
T-04 → T-05 → T-06           # backend config + models
T-07 → T-08 → T-09           # more models
T-10 → T-11 → T-12           # middleware + utils
T-13 → T-14 → T-15           # REST API
T-16 → T-17 → T-18 → T-19   # Socket.io server
T-20 → T-21 → T-22 → T-23   # frontend foundation
T-24 → T-25 → T-26 → T-27   # auth + lobby + room header + members
T-28 → T-29 → T-30           # tracks + player
T-31 → T-32 → T-33           # sync hooks + room page integration
T-34 → T-35 → T-36           # config + build check
```
