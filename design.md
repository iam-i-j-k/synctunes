# SyncTunes — Technical Design

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (Client)                      │
│  React + Vite  │  Zustand stores  │  Socket.io-client       │
│  HTML5 <audio> │  NTP clock sync  │  drift-correction loop  │
└───────────┬─────────────────────────────────┬───────────────┘
            │  HTTP/REST (JWT)                 │  WebSocket
            ▼                                 ▼
┌───────────────────────────────────────────────────────────────┐
│                     Node.js / Express Server                   │
│  REST API (auth, rooms, tracks)                               │
│  Socket.io server (playback events, sync, presence)           │
│  Multer upload middleware (size + format guard)               │
│  Cloudinary SDK (upload, destroy)                             │
└──────────────────────────┬────────────────────────────────────┘
                           │  Mongoose ODM
                           ▼
                    ┌─────────────┐
                    │   MongoDB   │
                    │  (Atlas or  │
                    │   local)    │
                    └─────────────┘
                           
                    ┌─────────────┐
                    │  Cloudinary │
                    │  CDN / store│
                    │ (audio only)│
                    └─────────────┘
```

Audio bytes flow **directly** from Cloudinary CDN to each browser client. The Express server never proxies audio — it only stores and returns the `secure_url`.

---

## 2. Directory Structure

```
synctunes/
├── requirements.md
├── design.md
├── tasks.md
├── .gitignore
│
├── server/
│   ├── package.json
│   ├── .env.example
│   ├── src/
│   │   ├── index.js              # Entry point: Express + Socket.io bootstrap
│   │   ├── config/
│   │   │   ├── db.js             # Mongoose connect
│   │   │   └── cloudinary.js     # Cloudinary SDK init
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Room.js
│   │   │   └── Track.js
│   │   ├── middleware/
│   │   │   ├── auth.js           # JWT verify middleware
│   │   │   └── upload.js         # multer + format/size guard
│   │   ├── routes/
│   │   │   ├── auth.js           # POST /api/auth/register, /login
│   │   │   ├── rooms.js          # CRUD rooms
│   │   │   └── tracks.js         # upload, list, delete tracks
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── roomController.js
│   │   │   └── trackController.js
│   │   ├── socket/
│   │   │   ├── index.js          # Socket.io server init, registers handlers
│   │   │   ├── roomHandlers.js   # room:join, room:leave
│   │   │   └── playbackHandlers.js # all playback:* + clock:sync + heartbeat
│   │   └── utils/
│   │       └── joinCode.js       # random 6-char alphanumeric generator
│
└── client/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    ├── .env.example
    └── src/
        ├── main.jsx
        ├── App.jsx               # Router root
        ├── api/
        │   └── axios.js          # Axios instance with JWT interceptor
        ├── socket/
        │   └── socket.js         # Socket.io-client singleton
        ├── stores/
        │   ├── authStore.js      # Zustand: user, token, login/logout
        │   ├── roomStore.js      # Zustand: current room, members, track list
        │   └── playerStore.js    # Zustand: playback state, actionSequence, clockOffset
        ├── hooks/
        │   ├── useClockSync.js   # NTP-style offset estimation
        │   └── useDriftCorrection.js # periodic heartbeat + seek
        ├── pages/
        │   ├── LoginPage.jsx
        │   ├── RegisterPage.jsx
        │   ├── LobbyPage.jsx     # list/create/join rooms
        │   └── RoomPage.jsx      # main room UI
        └── components/
            ├── AudioPlayer.jsx
            ├── TrackList.jsx
            ├── TrackUpload.jsx
            ├── MemberList.jsx
            ├── RoomHeader.jsx
            └── ProtectedRoute.jsx
```

---

## 3. Data Models

### 3.1 User

```js
{
  _id:          ObjectId,
  username:     String,   // unique, 3–30 chars
  email:        String,   // unique, lowercase
  passwordHash: String,   // bcrypt, cost 12
  createdAt:    Date
}
```

### 3.2 Room

```js
{
  _id:           ObjectId,
  name:          String,   // 1–50 chars
  hostId:        ObjectId, // ref: User
  isPrivate:     Boolean,  // default false
  joinCode:      String,   // 6-char alphanumeric, unique
  memberIds:     [ObjectId], // ref: User, max 20
  currentTrackId: ObjectId | null, // ref: Track
  playbackState: {
    isPlaying:          Boolean,  // default false
    startedAtServerTime: Number,  // epoch ms; meaningful only when isPlaying=true
    pausedAtOffsetMs:   Number,   // ms into track; 0 on trackChange
  },
  actionSequence: Number,  // integer, starts 0, increments on every accepted action
  createdAt:     Date
}
```

### 3.3 Track

```js
{
  _id:                ObjectId,
  roomId:             ObjectId, // ref: Room
  title:              String,
  artist:             String,
  cloudinaryUrl:      String,   // secure_url from Cloudinary
  cloudinaryPublicId: String,   // public_id from Cloudinary (for destroy)
  durationMs:         Number,
  uploadedBy:         ObjectId, // ref: User
  createdAt:          Date
}
```

**Index notes:**
- `User.email` — unique index
- `User.username` — unique index
- `Room.joinCode` — unique index
- `Track.roomId` — index for list queries

---

## 4. REST API

Base path: `/api`

All protected routes require `Authorization: Bearer <jwt>`.

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | No | Create account, return JWT |
| POST | `/auth/login` | No | Verify credentials, return JWT |

**Register body:** `{ username, email, password }`
**Login body:** `{ email, password }`
**JWT payload:** `{ userId, username, iat, exp }`

### Rooms

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/rooms` | Yes | List public rooms (paginated) |
| POST | `/rooms` | Yes | Create room |
| GET | `/rooms/:id` | Yes | Get single room (member or public) |
| PATCH | `/rooms/:id` | Yes (host) | Rename room |
| DELETE | `/rooms/:id` | Yes (host) | Delete room + cascade tracks |
| POST | `/rooms/join` | Yes | Join by `{ joinCode }` |
| POST | `/rooms/:id/kick` | Yes (host) | Kick member `{ memberId }` |

### Tracks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/rooms/:roomId/tracks` | Yes (member) | List tracks for room |
| POST | `/rooms/:roomId/tracks` | Yes (member) | Upload track (multipart/form-data) |
| DELETE | `/tracks/:id` | Yes (uploader or host) | Delete track |

---

## 5. Socket.io Event Specification

### Connection

- Client connects with `auth: { token: <jwt> }` in the handshake.
- Server middleware verifies the JWT on connect; rejects unauthenticated connections.

### Client → Server events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:join` | `{ roomId }` | Join room channel; server responds with full state |
| `room:leave` | `{ roomId }` | Leave room channel |
| `clock:sync` | `{ clientTime }` | NTP sync request |
| `playback:play` | `{ roomId, actionSequence }` | Start playback |
| `playback:pause` | `{ roomId, actionSequence }` | Pause playback |
| `playback:seek` | `{ roomId, actionSequence, positionMs }` | Seek to position |
| `playback:trackChange` | `{ roomId, trackId, actionSequence }` | Change track |
| `playback:heartbeat` | `{ roomId }` | Request authoritative position |

### Server → Client events

| Event | Payload | Description |
|-------|---------|-------------|
| `room:state` | `{ room, members, actionSequence }` | Full room state (on join / reconnect) |
| `room:memberUpdate` | `{ members: [{userId, username}] }` | Presence list changed |
| `room:kicked` | `{ roomId }` | You were kicked |
| `room:joinError` | `{ reason }` | Join rejected (ROOM_FULL, NOT_FOUND, etc.) |
| `room:staleAction` | `{ currentState, actionSequence }` | Action rejected; here's corrected state |
| `clock:syncResponse` | `{ clientTime, serverTime }` | NTP response |
| `playback:update` | `{ playbackState, actionSequence, currentTrackId }` | Broadcast after accepted action |
| `playback:heartbeatResponse` | `{ playbackState, actionSequence, serverTime }` | Heartbeat reply (unicast) |

---

## 6. Sync Architecture (Core)

### 6.1 Server-side playback state machine

The Room document is the single source of truth. All mutations are synchronous within a single Node.js event handler — no `await` between the `actionSequence` check and the increment — preventing TOCTOU within one event loop turn.

```
playback:play handler:
  1. Read room from in-memory cache (or DB)
  2. if client.actionSequence !== room.actionSequence → emit staleAction, return
  3. room.playbackState.startedAtServerTime = Date.now()
  4. room.playbackState.isPlaying = true
  5. room.actionSequence += 1
  6. persist to DB (async, fire-and-forget for latency; retried on failure)
  7. broadcast playback:update to all room members

playback:pause handler:
  1. Read room
  2. actionSequence check (same as above)
  3. room.playbackState.pausedAtOffsetMs = Date.now() - room.playbackState.startedAtServerTime
  4. room.playbackState.isPlaying = false
  5. room.actionSequence += 1
  6. persist, broadcast

playback:seek handler:
  1. Read room
  2. actionSequence check
  3. if isPlaying: room.playbackState.startedAtServerTime = Date.now() - positionMs
  4. else: room.playbackState.pausedAtOffsetMs = positionMs
  5. room.actionSequence += 1
  6. persist, broadcast

playback:trackChange handler:
  1. Read room
  2. actionSequence check
  3. room.currentTrackId = trackId
  4. room.playbackState = { isPlaying: false, startedAtServerTime: 0, pausedAtOffsetMs: 0 }
  5. room.actionSequence += 1
  6. persist, broadcast
```

### 6.2 In-memory room state cache

To avoid a DB round-trip on every playback event (which would add 10–50ms latency and create a wider async window), the server maintains an **in-memory Map** keyed by `roomId` containing the mutable fields (`playbackState`, `actionSequence`, `currentTrackId`, `memberIds`). DB writes are async but the in-memory copy is the live truth for event handlers.

On server restart, the cache is repopulated from DB on first `room:join` for each room.

### 6.3 Client-side NTP clock sync

```js
// On room:join and every 30s:
const clientTime = Date.now();
socket.emit('clock:sync', { clientTime });

socket.on('clock:syncResponse', ({ clientTime, serverTime }) => {
  const clientReceiveTime = Date.now();
  const roundTripTime = clientReceiveTime - clientTime;
  const serverTimeOffset = serverTime - (clientReceiveTime - roundTripTime / 2);
  playerStore.setClockOffset(serverTimeOffset);
});
```

### 6.4 Client-side playback position derivation

```js
function getServerNow() {
  return Date.now() + playerStore.serverTimeOffset;
}

function getAuthorisedPositionMs(playbackState) {
  if (playbackState.isPlaying) {
    return getServerNow() - playbackState.startedAtServerTime;
  }
  return playbackState.pausedAtOffsetMs;
}
```

### 6.5 Drift correction loop (every 5s)

```js
// useDriftCorrection.js
useEffect(() => {
  if (!isPlaying) return;
  const interval = setInterval(() => {
    socket.emit('playback:heartbeat', { roomId });
  }, 5000);
  return () => clearInterval(interval);
}, [isPlaying, roomId]);

socket.on('playback:heartbeatResponse', ({ playbackState, serverTime }) => {
  const authoritative = getAuthorisedPositionMs(playbackState);
  const localMs = audioRef.current.currentTime * 1000;
  if (Math.abs(localMs - authoritative) > 300) {
    audioRef.current.currentTime = authoritative / 1000;
  }
});
```

### 6.6 actionSequence race-condition handling

```
Client A sends play with seq=5
Client B sends pause with seq=5 (same seq, racing)

Server receives A first:
  - seq check: 5 === 5 ✓
  - commits play, seq becomes 6
  - broadcasts playback:update { ..., actionSequence: 6 } to all

Server then receives B:
  - seq check: 5 !== 6 ✗
  - emits room:staleAction to B with { currentState, actionSequence: 6 }
  - B updates its local seq to 6, re-renders play state

Result: play wins, B is corrected. No ambiguous state.
```

---

## 7. Authentication Flow

```
Register:
  POST /api/auth/register
  → validate body
  → check uniqueness (email, username)
  → bcrypt.hash(password, 12)
  → save User
  → jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' })
  → return { token, user: { id, username, email } }

Login:
  POST /api/auth/login
  → find User by email
  → bcrypt.compare(password, passwordHash)
  → jwt.sign(...)
  → return { token, user }

Protected route middleware:
  → extract Bearer token
  → jwt.verify(token, JWT_SECRET)
  → attach decoded payload to req.user
  → next()

Socket.io auth middleware:
  → socket.handshake.auth.token
  → jwt.verify(...)
  → attach to socket.data.user
  → next()
```

---

## 8. Cloudinary Integration

```
Upload flow:
  1. Client POSTs multipart/form-data to POST /api/rooms/:roomId/tracks
  2. multer memStorage buffers file in memory (never touches disk)
  3. upload.js middleware checks:
     - file.mimetype in ['audio/mpeg','audio/wav','audio/x-m4a','audio/mp4']
     - file.size <= 15 * 1024 * 1024 (15 MB)
     - if either fails → 400, do not call Cloudinary
  4. trackController uploads buffer via cloudinary.uploader.upload_stream
     with { resource_type: 'video', folder: 'synctunes/tracks' }
  5. Cloudinary returns { secure_url, public_id, duration (seconds) }
  6. Track document saved with cloudinaryUrl, cloudinaryPublicId, durationMs

Delete flow:
  1. DELETE /api/tracks/:id
  2. Verify requester is uploader or room host
  3. cloudinary.uploader.destroy(track.cloudinaryPublicId, { resource_type: 'video' })
  4. Delete Track document
  5. If destroy fails: log publicId + error, delete doc anyway, return 207

Room cascade delete:
  1. Fetch all Track docs where roomId = room._id
  2. For each: destroy from Cloudinary (parallel Promise.allSettled)
  3. Log any failures (publicId + error)
  4. deleteMany Track docs
  5. Delete Room doc
```

**⚠ Cloudinary Free Tier Scaling Constraint:**
Cloudinary's free tier provides approximately 25 credits/month (storage + transformation + bandwidth combined). SyncTunes is inherently bandwidth-intensive: every concurrent listener independently streams the audio file from Cloudinary on each playback. A 5MB track with 10 concurrent listeners = 50MB of bandwidth per full play. At demo/portfolio scale (low concurrent users, occasional use) this is fine. At production scale it would exhaust the free tier rapidly. Mitigation options for a future paid tier: Cloudinary's adaptive streaming (HLS), caching at a CDN edge, or migration to S3 + CloudFront. **This is a known constraint, not a bug.**

---

## 9. Frontend State Architecture (Zustand)

### authStore
```js
{
  user: { id, username, email } | null,
  token: string | null,
  // actions:
  login(user, token),
  logout(),
}
// persisted to localStorage via zustand/middleware/persist
```

### roomStore
```js
{
  currentRoom: Room | null,
  members: [{ userId, username }],
  tracks: Track[],
  // actions:
  setRoom(room),
  setMembers(members),
  setTracks(tracks),
  addTrack(track),
  removeTrack(trackId),
  clearRoom(),
}
```

### playerStore
```js
{
  playbackState: {
    isPlaying: boolean,
    startedAtServerTime: number,
    pausedAtOffsetMs: number,
  },
  actionSequence: number,
  currentTrackId: string | null,
  serverTimeOffset: number,  // NTP-derived ms offset
  // actions:
  applyPlaybackUpdate(playbackState, actionSequence, currentTrackId),
  setClockOffset(offset),
}
```

---

## 10. Key Design Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| Server-authoritative playback with `startedAtServerTime` | Eliminates client-to-client drift; position is always derivable from a single formula |
| In-memory room state cache on server | Removes DB round-trip from the hot path (every 5s heartbeat × N members); actionSequence check stays synchronous |
| NTP-style clock offset per client | Compensates for the fact that different clients have different local clocks; without this, `Date.now() - startedAtServerTime` would drift proportionally to client clock skew |
| actionSequence on every mutation | Makes concurrent writes from multiple members deterministic — last writer to reach the server with a valid seq wins; everyone else gets corrected state |
| multer memStorage (not diskStorage) | Files never touch the server's disk; avoids disk-full issues and simplifies cleanup; acceptable because max file size is 15 MB |
| Zustand over Redux | Less boilerplate for a focused app; no middleware needed beyond persist; easier to reason about socket-driven state updates |
| HTML5 `<audio>` over third-party player | Full control over `currentTime` for drift correction; no iframe isolation boundary; no API key dependency |
| Promise.allSettled for cascade Cloudinary deletes | Individual Cloudinary failures don't block room deletion; all failures are logged |

---

## 11. Environment Variables

### server/.env.example
```
PORT=4000
MONGO_URI=mongodb://localhost:27017/synctunes
JWT_SECRET=replace_with_at_least_32_char_random_string
JWT_EXPIRES_IN=7d
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
CLIENT_ORIGIN=http://localhost:5173
```

### client/.env.example
```
VITE_API_URL=http://localhost:4000/api
VITE_SOCKET_URL=http://localhost:4000
```
