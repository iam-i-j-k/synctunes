const fs = require('fs');
const path = require('path');

const roomModelPath = path.join(__dirname, 'server', 'src', 'models', 'Room.js');
let roomModel = fs.readFileSync(roomModelPath, 'utf8');
roomModel = roomModel.replace(/startedAtServerTime/g, 'serverStartTime');
roomModel = roomModel.replace(/pausedAtOffsetMs/g, 'startPosition');
roomModel = roomModel.replace(/\/\/ ms into track/g, '// seconds into track');
fs.writeFileSync(roomModelPath, roomModel, 'utf8');

const handlersPath = path.join(__dirname, 'server', 'src', 'socket', 'playbackHandlers.js');
let handlers = fs.readFileSync(handlersPath, 'utf8');

// Replace getState and persistState fields
handlers = handlers.replace(/startedAtServerTime/g, 'serverStartTime');
handlers = handlers.replace(/pausedAtOffsetMs/g, 'startPosition');

// Replace play logic
handlers = handlers.replace(
  /const offset = state\.playbackState\.startPosition \|\| 0;\s+state\.playbackState\.serverStartTime = Date\.now\(\) - offset;\s+state\.playbackState\.isPlaying = true;/g,
  `state.playbackState.serverStartTime = Date.now();
    state.playbackState.isPlaying = true;`
);

// Replace pause logic
handlers = handlers.replace(
  /state\.playbackState\.startPosition =\s+Date\.now\(\) - state\.playbackState\.serverStartTime;\s+state\.playbackState\.isPlaying = false;/g,
  `const elapsedSeconds = (Date.now() - state.playbackState.serverStartTime) / 1000;
    state.playbackState.startPosition = state.playbackState.startPosition + elapsedSeconds;
    state.playbackState.isPlaying = false;`
);

// Replace seek logic
handlers = handlers.replace(
  /if \(state\.playbackState\.isPlaying\) \{\s+\/\/ Re-anchor start time so that currentPosition = positionMs right now\s+state\.playbackState\.serverStartTime = Date\.now\(\) - positionMs;\s+\} else \{\s+state\.playbackState\.startPosition = positionMs;\s+\}/g,
  `const positionSec = positionMs / 1000;
    if (state.playbackState.isPlaying) {
      state.playbackState.serverStartTime = Date.now();
      state.playbackState.startPosition = positionSec;
    } else {
      state.playbackState.startPosition = positionSec;
    }`
);

// Replace current position check in prev
handlers = handlers.replace(
  /const currentPosition = state\.playbackState\.isPlaying\s+\? Date\.now\(\) - state\.playbackState\.serverStartTime\s+: state\.playbackState\.startPosition;/g,
  `const currentPosition = state.playbackState.isPlaying 
      ? state.playbackState.startPosition * 1000 + (Date.now() - state.playbackState.serverStartTime) 
      : state.playbackState.startPosition * 1000;`
);

fs.writeFileSync(handlersPath, handlers, 'utf8');
console.log('Refactoring complete.');
