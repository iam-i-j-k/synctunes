const dns = require('dns');
dns.setServers(['1.1.1.1', '8.8.8.8']);
require('dotenv').config();
const mongoose = require('mongoose');
const Track = require('./src/models/Track');
const Room = require('./src/models/Room');

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const dup = await Track.findOneAndDelete({ _id: '6a7d634188f2dd8be3306e8a' });
    if (dup) {
      await Room.updateOne({ _id: dup.roomId }, { $pull: { trackIds: dup._id } });
      console.log('Removed duplicate track from DB');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
