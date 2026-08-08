const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateJoinCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

module.exports = { generateJoinCode };
