const express = require('express');
const { validateNuvioCredentials } = require('../providers/nuvioAuth');

module.exports = ({ prisma, getAccountId, encrypt, decrypt }) => {
  const router = express.Router();

  // Validate Nuvio credentials
  router.post('/validate', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ valid: false, error: 'Email and password are required' });
      }

      const result = await validateNuvioCredentials(email, password);
      res.json({
        valid: true,
        user: {
          id: result.user.id,
          email: result.user.email
        }
      });
    } catch (error) {
      const msg = String(error?.message || '').toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid email') || msg.includes('wrong password')) {
        res.json({ valid: false, error: 'Invalid email or password' });
      } else {
        console.error('Nuvio validation error:', error);
        res.json({ valid: false, error: 'Failed to validate credentials' });
      }
    }
  });

  // Connect a user to Nuvio (store encrypted refresh token)
  router.post('/connect', async (req, res) => {
    try {
      const { userId, email, password } = req.body;

      if (!userId || !email || !password) {
        return res.status(400).json({ error: 'userId, email, and password are required' });
      }

      // Validate credentials with Nuvio
      const result = await validateNuvioCredentials(email, password);

      // Encrypt and store the refresh token
      const encryptedRefreshToken = encrypt(result.tokens.refreshToken, req);

      // Update user with Nuvio credentials
      await prisma.user.update({
        where: { id: userId, accountId: getAccountId(req) },
        data: {
          providerType: 'nuvio',
          nuvioRefreshToken: encryptedRefreshToken,
          nuvioUserId: result.user.id,
          email: result.user.email
        }
      });

      res.json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email
        }
      });
    } catch (error) {
      console.error('Nuvio connect error:', error);
      res.status(500).json({ error: error.message || 'Failed to connect to Nuvio' });
    }
  });

  // Connect via auth key (for invitation completion flow)
  router.post('/connect-authkey', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      // Validate with Nuvio
      const result = await validateNuvioCredentials(email, password);

      res.json({
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email
        },
        providerType: 'nuvio',
        nuvioUserId: result.user.id
      });
    } catch (error) {
      console.error('Nuvio connect-authkey error:', error);
      res.status(500).json({ error: error.message || 'Failed to validate Nuvio credentials' });
    }
  });

  return router;
};
