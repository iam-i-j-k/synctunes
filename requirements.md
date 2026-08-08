# SyncTunes — Requirements

## Overview

SyncTunes is a real-time collaborative music listening web application. Users create or join rooms and listen to the same audio track in tight synchronization. Any room member can control playback. A server-authoritative sync model eliminates client-side drift.

---

## Ambiguity Resolutions (review before implementation proceeds)

The following four known ambiguities are resolved here with explicit assumptions. These are **flagged for review** — if any resolution conflicts with your intent, correct it before implementation starts.

### A1 — Mid-action disconnect
**Ambiguity:** A member disconnects right as their playback action (play/pause/seek/trackChange) is being processed. Should the server apply the action or discard it?

**Resolution (ASSUMPTION):** The server applies the action if the Socket.io message was received and the `actionSequence` check passes at the time of processing. TCP delivery guarantees the message arrived before the disconnect event fires at the application layer, so the action is valid and is committed. The disconnect is handled separately via the `disconnect` event (member removed, `room:memberUpdate` broadcast). Net effect: the action takes effect, the member disappears from the presence list moments later.

### A2 — Reconnection recovery
**Ambiguity:** A client's socket drops for an arbitrary duration (e.g., 10s). How does it recover playback position and `actionSequence` on reconnect?

**Resolution (ASSUMPTION):** On every `room:join` (which the client re-emits after reconnection), the server responds with a full room state payload: `{ currentTrackId, playbackState: { isPlaying, startedAtServerTime, pausedAtOffsetMs }, actionSequence, members[] }`. The client uses this payload to re-derive the current playback position (per the sync algorithm), seeks `audio.currentTime` to that position, and restores its local `actionSequence` reference. No separate reconnect handshake is needed — `room:join` is idempotent and always returns authoritative state. Socket.io's built-in reconnection (`reconnect: true`) re-emits `room:join` automatically via a client-side `connect` event listener.

### A3 — Maximum room size
**Ambiguity:** What is the hard cap on members per room?

**Resolution (ASSUMPTION):** Hard cap of **20 members per room**, enforced server-side on `room:join`. This balances demo-scale fan-out cost (20 simultaneous audio streams from Cloudinary) with acceptable sync heartbeat broadcast load. If a room is full, the server emits a `room:joinError` event back to the requesting client with `{ reason: "ROOM_FULL" }` and does not add them.

### A4 — Room/track deletion cascade
**Ambiguity:** When a room is deleted, what happens to the Cloudinary audio files for tracks that belong to that room?

**Resolution (ASSUMPTION):** Cascade delete. When the host deletes a room, the server calls Cloudinary's `destroy` API for every Track document associated with that room (using the stored `cloudinaryPublicId`), then deletes the Track documents, then deletes the Room document. This prevents orphaned files consuming Cloudinary storage. Partial failures (Cloudinary API error on one track) are logged server-side but do not block the room deletion — the room is deleted regardless, and the operator must manually clean up any tracks whose Cloudinary deletion failed (a warning is logged with the `cloudinaryPublicId`).

---

## Functional Requirements

### FR-1 Authentication

**FR-1.1** WHEN a visitor submits a registration form with a unique email, a unique username, and a password of at least 8 characters, the system SHALL create a User account and return a signed JWT.

**FR-1.2** WHEN a visitor submits a login form with a registered email and correct password, the system SHALL return a signed JWT valid for 7 days.

**FR-1.3** WHEN a visitor submits registration with an email or username that already exists, the system SHALL return HTTP 409 with a message identifying which field conflicts.

**FR-1.4** WHEN a request arrives at any protected endpoint without a valid JWT in the `Authorization: Bearer <token>` header, the system SHALL return HTTP 401.

**FR-1.5** WHILE a JWT is valid, the system SHALL allow the token holder to access all protected endpoints without re-authentication.

---

### FR-2 Room Management

**FR-2.1** WHEN an authenticated user submits a create-room request with a name (1–50 chars) and optional `isPrivate` flag, the system SHALL create a Room document, set the requesting user as `hostId`, generate a random 6-character alphanumeric `joinCode`, initialize `actionSequence` to 0, and return the full room object.

**FR-2.2** WHEN an authenticated user requests to join a room by `joinCode` or direct `roomId`, and the room has fewer than 20 members, the system SHALL add that user to `memberIds[]` and emit a `room:memberUpdate` event to all existing members.

**FR-2.3** WHEN an authenticated user attempts to join a full room (20 members), the system SHALL emit `room:joinError { reason: "ROOM_FULL" }` to that client only and not add them to the room.

**FR-2.4** WHEN the host of a room sends a delete-room request, the system SHALL cascade-delete all associated tracks (including Cloudinary files) and then delete the room document.

**FR-2.5** WHEN the host of a room sends a rename request with a valid name (1–50 chars), the system SHALL update the room name and broadcast the updated room state to all members.

**FR-2.6** WHEN the host sends a kick-member request with a valid `memberId`, the system SHALL remove that user from `memberIds[]`, disconnect their socket from the room's Socket.io channel, emit `room:kicked` to the removed user, and broadcast `room:memberUpdate` to remaining members.

**FR-2.7** WHEN any authenticated user leaves a room voluntarily (via UI or socket disconnect), the system SHALL remove them from `memberIds[]` and broadcast `room:memberUpdate`.

**FR-2.8** WHEN the host leaves the room, the system SHALL transfer host role to the longest-standing remaining member. IF no members remain, the room SHALL persist in the database but enter an idle state (no active playback).

**FR-2.9** WHEN a user lists rooms, the system SHALL return all public rooms. Private room details SHALL only be accessible to current members or via valid `joinCode`.

---

### FR-3 Track Management

**FR-3.1** WHEN an authenticated room member submits an audio file upload (mp3, wav, or m4a, ≤15 MB), the system SHALL validate format and size at the multer layer before touching Cloudinary, upload to Cloudinary with `resource_type: "video"`, create a Track document with `{ title, artist, cloudinaryUrl, cloudinaryPublicId, durationMs, uploadedBy }`, and return the Track object.

**FR-3.2** WHEN an upload is rejected because the file exceeds 15 MB or has a disallowed format, the system SHALL return HTTP 400 with a descriptive error and SHALL NOT contact Cloudinary.

**FR-3.3** WHEN a room member requests deletion of a track they uploaded (or the host requests deletion of any track in their room), the system SHALL call Cloudinary's `destroy` API with the stored `cloudinaryPublicId`, then delete the Track document.

**FR-3.4** WHEN a track deletion's Cloudinary API call fails, the system SHALL log the `cloudinaryPublicId` and error, delete the Track document anyway, and return HTTP 207 with a warning in the response body.

**FR-3.5** WHEN a room member requests the track list for a room, the system SHALL return all Track documents associated with that room.

---

### FR-4 Playback Control

**FR-4.1** WHEN any room member emits `playback:play` with the correct `actionSequence`, the system SHALL record `startedAtServerTime = Date.now()` (server epoch ms), set `isPlaying = true`, clear `pausedAtOffsetMs`, increment `actionSequence`, and broadcast the updated playback state + new `actionSequence` to all room members.

**FR-4.2** WHEN any room member emits `playback:pause` with the correct `actionSequence`, the system SHALL compute `pausedAtOffsetMs = Date.now() - startedAtServerTime`, set `isPlaying = false`, increment `actionSequence`, and broadcast the updated state.

**FR-4.3** WHEN any room member emits `playback:seek` with the correct `actionSequence` and a `positionMs` value, the system SHALL update `pausedAtOffsetMs = positionMs` (keeping current play/pause state), recompute `startedAtServerTime = Date.now() - positionMs` if currently playing, increment `actionSequence`, and broadcast.

**FR-4.4** WHEN any room member emits `playback:trackChange` with the correct `actionSequence` and a valid `trackId`, the system SHALL set `currentTrackId`, reset `pausedAtOffsetMs = 0`, set `isPlaying = false`, increment `actionSequence`, and broadcast.

**FR-4.5** WHEN a client emits any playback event with a **stale** `actionSequence` (does not match server's current value), the system SHALL reject the action, NOT change any playback state, and emit `room:staleAction` to that client only with the current authoritative state and `actionSequence`.

**FR-4.6** WHEN a client emits `playback:heartbeat`, the server SHALL respond to that client only with the current `{ playbackState, actionSequence, serverTime: Date.now() }` — no state mutation.

---

### FR-5 Clock Synchronization

**FR-5.1** WHEN a client emits `clock:sync { clientTime: Date.now() }`, the server SHALL respond with `{ clientTime, serverTime: Date.now() }` immediately, with no server-side processing between receiving and responding.

**FR-5.2** WHEN a client receives a `clock:sync` response, it SHALL compute:
```
roundTripTime = clientReceiveTime - clientTime
serverTimeOffset = serverTime - (clientReceiveTime - roundTripTime / 2)
```
and store `serverTimeOffset` for use in all playback position calculations.

**FR-5.3** WHEN a client is inside a room, it SHALL perform the clock sync on join and repeat it every 30 seconds to track clock drift.

**FR-5.4** WHEN a client computes its local playback position, it SHALL use `correctedNow = Date.now() + serverTimeOffset` in place of `Date.now()` when evaluating `correctedNow - startedAtServerTime`.

---

### FR-6 Drift Correction

**FR-6.1** WHEN a client is actively playing audio, it SHALL emit `playback:heartbeat` every 5 seconds to obtain the authoritative server position.

**FR-6.2** WHEN the client computes that its `audio.currentTime` differs from the server-authoritative position by more than 300 ms, it SHALL seek `audio.currentTime` to the corrected position.

**FR-6.3** WHEN the server-authoritative state says the track is paused, the client SHALL ensure `audio.paused === true` regardless of local state.

**FR-6.4** WHEN the server-authoritative state says the track is playing, the client SHALL ensure `audio.paused === false` and apply drift correction if needed.

---

### FR-7 Presence

**FR-7.1** WHEN any user joins or leaves a room, the system SHALL broadcast `room:memberUpdate { members: [{ userId, username }] }` to all remaining members in that room.

**FR-7.2** WHEN a socket disconnects unexpectedly, the system SHALL treat it identically to a voluntary leave for presence purposes (after a 5-second grace period to allow clean reconnection without spurious leave/join flickers).

---

## Non-Functional Requirements

**NFR-1** The server-side actionSequence check and state mutation MUST be synchronous within a single event handler execution (no async gaps between read and write of `actionSequence`) to prevent TOCTOU race conditions within a single Node.js event loop turn.

**NFR-2** Audio files MUST be served directly from Cloudinary CDN URLs stored on the Track document. The backend MUST NOT proxy audio bytes.

**NFR-3** All API endpoints returning lists SHALL support basic pagination (`page`, `limit` query params) with a default limit of 20.

**NFR-4** Passwords MUST be hashed with bcrypt (min cost factor 12) before storage. Plain-text passwords MUST NOT appear in logs or responses.

**NFR-5** JWTs MUST be signed with HS256 using a secret of at least 32 characters loaded from environment variables.

**NFR-6** The frontend MUST be responsive (usable on viewport widths from 375px to 1440px+).

**NFR-7 (Cloudinary bandwidth constraint):** Cloudinary's free tier provides ~25 credits/month. Audio streaming is bandwidth-heavy — every concurrent listener independently streams from Cloudinary. At demo/portfolio scale this is acceptable, but the app MUST NOT implement any server-side audio proxying that would multiply that bandwidth cost. This constraint is documented in design.md and is a known scaling limit.

---

## Out of Scope (v1)

- YouTube / Spotify / external music service integration
- Voice or video chat
- Native mobile apps
- Music recommendation engine
- OAuth / social login
- Playlist ordering / queue management beyond a flat track list
- Waveform visualization
- Lyrics display
