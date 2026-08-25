const express = require('express');
const { protect } = require('../middleware/auth');
const {
  createRoom,
  listRooms,
  getRoom,
  updateRoom,
  deleteRoom,
  joinRoom,
  kickMember,
} = require('../controllers/roomController');

const router = express.Router();

router.use(protect);

router.get('/', listRooms);
router.post('/', createRoom);
router.post('/join', joinRoom);
router.get('/:id', getRoom);
router.patch('/:id', updateRoom);
router.delete('/:id', deleteRoom);
router.post('/:id/kick', kickMember);

module.exports = router;
