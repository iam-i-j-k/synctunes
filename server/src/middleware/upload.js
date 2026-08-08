const multer = require('multer');

const ALLOWED_MIME_TYPES = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4', 'audio/x-wav'];
const MAX_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_FILES = 10;

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES, files: MAX_FILES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        Object.assign(new Error('Invalid file type. Allowed: mp3, wav, m4a'), {
          code: 'INVALID_FILE_TYPE',
          status: 400,
        }),
        false
      );
    }
  },
});

function uploadAudio(req, res, next) {
  upload.array('audio', MAX_FILES)(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'File too large. Maximum size is 15 MB.' });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ message: 'Too many files. Maximum is 10 uploads per request.' });
    }
    if (err.code === 'INVALID_FILE_TYPE') {
      return res.status(400).json({ message: err.message });
    }
    return res.status(400).json({ message: err.message || 'Upload error' });
  });
}

module.exports = { uploadAudio };
