const mongoose = require('mongoose');
const Room = require('./src/models/Room');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to DB');

  // Find all rooms named "My Library" that are NOT flagged as isPersonalLibrary
  const rooms = await Room.find({ name: 'My Library', isPersonalLibrary: { $ne: true } });
  
  console.log(`Found ${rooms.length} old "My Library" rooms.`);

  let deletedCount = 0;
  for (const room of rooms) {
    // We just delete the room directly to clear the spam.
    // We do not do cascade deletion of Tracks because they belong to other rooms originally!
    await Room.findByIdAndDelete(room._id);
    deletedCount++;
  }

  console.log(`Deleted ${deletedCount} rooms.`);
  mongoose.disconnect();
}

run().catch(console.error);
