const cloudinary = require('cloudinary').v2;

// Configure lazily so env vars are guaranteed loaded by the time this runs
function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  return cloudinary;
}

module.exports = getCloudinary;
