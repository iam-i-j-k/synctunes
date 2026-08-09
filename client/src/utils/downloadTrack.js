export async function downloadTrack(track) {
  if (!track || !track.cloudinaryUrl) return;

  try {
    // Cloudinary URLs typically look like:
    // https://res.cloudinary.com/<cloud_name>/video/upload/v1234567890/filename.mp3
    // We want to insert 'fl_attachment' into the upload parameters to force a download.

    const urlParts = track.cloudinaryUrl.split('/upload/');
    let downloadUrl = track.cloudinaryUrl;

    if (urlParts.length === 2) {
      // Sanitize the track title to make it safe for Cloudinary's URL parameter
      const safeTitle = (track.title || 'track').replace(/[^a-zA-Z0-9-_\s]/g, '').trim().replace(/\s+/g, '_');
      
      // Cloudinary allows specifying the filename by appending it to fl_attachment:
      downloadUrl = `${urlParts[0]}/upload/fl_attachment:${safeTitle}/${urlParts[1]}`;
    }

    // By creating a temporary anchor tag with the downloadUrl, 
    // the browser will trigger a file download.
    const a = document.createElement('a');
    a.href = downloadUrl;
    // Cloudinary's fl_attachment handles the download headers, but we can also set the download attribute
    a.download = `${track.title || 'track'}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (error) {
    console.error('Failed to download track:', error);
  }
}
