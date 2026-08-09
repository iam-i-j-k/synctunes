const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), username: user.username },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

async function register(req, res) {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'username, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check uniqueness
    const [existingEmail, existingUsername] = await Promise.all([
      User.findOne({ email: email.toLowerCase() }),
      User.findOne({ username }),
    ]);
    if (existingEmail) return res.status(409).json({ message: 'Email already in use', field: 'email' });
    if (existingUsername) return res.status(409).json({ message: 'Username already taken', field: 'username' });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ username, email: email.toLowerCase(), passwordHash });

    const token = signToken(user);
    return res.status(201).json({
      token,
      user: { id: user._id, username: user.username, email: user.email, likedTracks: user.likedTracks || [] },
    });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, likedTracks: user.likedTracks || [] },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

async function googleLogin(req, res) {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google token verification failed:', err);
      return res.status(401).json({ message: 'Invalid Google token' });
    }

    const { sub: googleId, email, name, picture } = payload;
    const lowerEmail = email.toLowerCase();

    // Find existing user by googleId or email
    let user = await User.findOne({
      $or: [{ googleId }, { email: lowerEmail }],
    });

    if (!user) {
      // Create new user
      // Generate a base username from email or name
      let baseUsername = name ? name.replace(/\s+/g, '').toLowerCase() : lowerEmail.split('@')[0];
      // Ensure it's unique
      let username = baseUsername;
      let counter = 1;
      while (await User.findOne({ username })) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      user = await User.create({
        username,
        email: lowerEmail,
        googleId,
        avatarUrl: picture,
      });
    } else {
      // If user exists but doesn't have googleId linked (they signed up with email before)
      if (!user.googleId) {
        user.googleId = googleId;
        user.avatarUrl = user.avatarUrl || picture;
        await user.save();
      }
    }

    const token = signToken(user);
    return res.json({
      token,
      user: { id: user._id, username: user.username, email: user.email, avatarUrl: user.avatarUrl, likedTracks: user.likedTracks || [] },
    });
  } catch (err) {
    console.error('googleLogin error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
}

module.exports = { register, login, googleLogin };
