const express = require('express');
const { validateNuvioCredentials, startNuvioTvLogin, pollNuvioTvLogin, exchangeNuvioTvLogin } = require('../providers/nuvioAuth');

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
      const { userId, email, password, nuvioUserId: oauthNuvioUserId, refreshToken: oauthRefreshToken } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
      }

      let nuvioUserId, nuvioEmail, refreshToken;

      if (oauthNuvioUserId && oauthRefreshToken) {
        // OAuth reconnection — tokens already exchanged
        nuvioUserId = oauthNuvioUserId;
        nuvioEmail = email;
        refreshToken = oauthRefreshToken;
      } else if (email && password) {
        // Credentials reconnection
        const result = await validateNuvioCredentials(email, password);
        nuvioUserId = result.user.id;
        nuvioEmail = result.user.email;
        refreshToken = result.tokens.refreshToken;
      } else {
        return res.status(400).json({ error: 'Either email+password or OAuth tokens are required' });
      }

      const encryptedRefreshToken = encrypt(refreshToken, req);

      await prisma.user.update({
        where: { id: userId, accountId: getAccountId(req) },
        data: {
          providerType: 'nuvio',
          nuvioRefreshToken: encryptedRefreshToken,
          nuvioUserId,
          email: nuvioEmail || email
        }
      });

      res.json({
        success: true,
        user: {
          id: nuvioUserId,
          email: nuvioEmail || email
        }
      });
    } catch (error) {
      console.error('Nuvio connect error:', error);
      res.status(500).json({ error: error.message || 'Failed to connect to Nuvio' });
    }
  });

  // Connect via credentials or OAuth (validate + optionally create user)
  router.post('/connect-authkey', async (req, res) => {
    try {
      const { email, password, username, groupName, colorIndex, create, nuvioUserId: oauthNuvioUserId, refreshToken: oauthRefreshToken } = req.body;

      let nuvioUserId;
      let nuvioEmail;
      let refreshToken;

      if (oauthNuvioUserId && !password) {
        // OAuth path — user already validated via exchange
        nuvioUserId = oauthNuvioUserId;
        nuvioEmail = email;
        refreshToken = oauthRefreshToken || null;
      } else {
        // Credentials path — validate with Nuvio
        if (!email || !password) {
          return res.status(400).json({ error: 'Email and password are required' });
        }
        const result = await validateNuvioCredentials(email, password);
        nuvioUserId = result.user.id;
        nuvioEmail = result.user.email;
        refreshToken = result.tokens.refreshToken;
      }

      if (!create) {
        return res.json({
          success: true,
          user: { id: nuvioUserId, email: nuvioEmail },
          providerType: 'nuvio',
          nuvioUserId
        });
      }

      // Create user in DB
      const accountId = getAccountId(req);
      const normalizedEmail = nuvioEmail?.toLowerCase?.() || email.toLowerCase();

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: { accountId, email: normalizedEmail }
      });
      if (existingUser) {
        return res.status(409).json({ message: 'User already exists' });
      }

      // Determine username
      let finalUsername = username || normalizedEmail.split('@')[0];
      let baseUsername = finalUsername;
      let attempt = 0;
      while (await prisma.user.findFirst({ where: { accountId, username: finalUsername } })) {
        attempt++;
        finalUsername = `${baseUsername}${attempt}`;
      }

      // Encrypt refresh token (null for OAuth-only users until first provider use)
      const encryptedRefreshToken = refreshToken ? encrypt(refreshToken, req) : null;

      // Find or create group
      let groupId = null;
      if (groupName) {
        const group = await prisma.group.findFirst({ where: { accountId, name: groupName } });
        groupId = group?.id || null;
      }

      // Create user
      const newUser = await prisma.user.create({
        data: {
          accountId,
          username: finalUsername,
          email: normalizedEmail,
          providerType: 'nuvio',
          nuvioRefreshToken: encryptedRefreshToken,
          nuvioUserId,
          isActive: true,
          colorIndex: colorIndex || 0,
        }
      });

      // Add to group if specified
      if (groupId) {
        const group = await prisma.group.findUnique({ where: { id: groupId }, select: { userIds: true } });
        const currentIds = typeof group?.userIds === 'string' ? JSON.parse(group.userIds) : (group?.userIds || []);
        if (!currentIds.includes(newUser.id)) {
          currentIds.push(newUser.id);
          await prisma.group.update({ where: { id: groupId }, data: { userIds: JSON.stringify(currentIds) } });
        }
      }

      res.json({
        success: true,
        user: { id: newUser.id, username: finalUsername, email: normalizedEmail },
        providerType: 'nuvio',
        nuvioUserId
      });
    } catch (error) {
      console.error('Nuvio connect-authkey error:', error);
      res.status(500).json({ error: error.message || 'Failed to validate Nuvio credentials' });
    }
  });

  // --- Nuvio OAuth (TV Login) Flow ---

  // Start a new Nuvio OAuth session
  router.post('/start-oauth', async (req, res) => {
    try {
      const result = await startNuvioTvLogin()
      res.json(result)
    } catch (error) {
      console.error('Nuvio start-oauth error:', error)
      res.status(500).json({ error: error.message || 'Failed to start Nuvio OAuth' })
    }
  })

  // Poll an existing Nuvio OAuth session
  router.post('/poll-oauth', async (req, res) => {
    try {
      const { code, deviceNonce, anonToken } = req.body
      if (!code || !deviceNonce || !anonToken) {
        return res.status(400).json({ error: 'code, deviceNonce, and anonToken are required' })
      }
      const result = await pollNuvioTvLogin(code, deviceNonce, anonToken)
      res.json(result)
    } catch (error) {
      console.error('Nuvio poll-oauth error:', error)
      res.status(500).json({ error: error.message || 'Failed to poll Nuvio OAuth' })
    }
  })

  // Exchange approved OAuth session for tokens
  router.post('/exchange-oauth', async (req, res) => {
    try {
      const { code, deviceNonce, anonToken } = req.body
      if (!code || !deviceNonce || !anonToken) {
        return res.status(400).json({ error: 'code, deviceNonce, and anonToken are required' })
      }
      const result = await exchangeNuvioTvLogin(code, deviceNonce, anonToken)
      res.json({
        success: true,
        user: result.user,
        refreshToken: result.refreshToken
      })
    } catch (error) {
      console.error('Nuvio exchange-oauth error:', error)
      res.status(500).json({ error: error.message || 'Failed to exchange Nuvio OAuth' })
    }
  })

  return router;
};
