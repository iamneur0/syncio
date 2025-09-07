const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const fs = require('fs').promises;
const path = require('path');
const { StremioAPIStore } = require('stremio-api-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// File-based storage paths
const DATA_DIR = path.join(__dirname, './data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADDONS_FILE = path.join(DATA_DIR, 'addons.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');

// Ensure data directory exists
async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create data directory:', error);
  }
}

// File-based storage helpers
async function readJSONFile(filePath, defaultValue = []) {
  try {
    const data = await fs.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      await writeJSONFile(filePath, defaultValue);
      return defaultValue;
    }
    throw error;
  }
}

async function writeJSONFile(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
}));
app.use(limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize storage
let users = [];
let addons = [];
let groups = [];

// Load data on startup
async function loadData() {
  try {
    users = await readJSONFile(USERS_FILE, []);
    addons = await readJSONFile(ADDONS_FILE, [
      {
        id: '1',
        name: 'Torrentio',
        description: 'Provides torrent streams from various sources',
        url: 'https://torrentio.stremio.com/configure',
        category: 'Movies & TV',
        status: 'active',
        users: 0,
        groups: 0
      }
    ]);
    groups = await readJSONFile(GROUPS_FILE, []);
    console.log(`📁 Loaded ${users.length} users, ${addons.length} addons, ${groups.length} groups`);
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

// Save data helpers
async function saveUsers() {
  await writeJSONFile(USERS_FILE, users);
}

async function saveAddons() {
  await writeJSONFile(ADDONS_FILE, addons);
}

async function saveGroups() {
  await writeJSONFile(GROUPS_FILE, groups);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Syncio backend with Stremio integration',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    users: users.length,
    addons: addons.length,
    groups: groups.length
  });
});

// Stremio Authentication Endpoints
app.post('/api/stremio/connect', async (req, res) => {
  try {
    const { displayName, email, password, username } = req.body;
    
    if (!displayName || !email || !password) {
      return res.status(400).json({ message: 'Display name, email and password are required' });
    }

    // Create Stremio API store for this user
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => null, // We'll handle storage ourselves
        setJSON: (key, value) => {} // We'll handle storage ourselves
      },
    });

    // Attempt to authenticate with Stremio
    await apiStore.login({ email, password });
    
    if (!apiStore.user) {
      return res.status(401).json({ message: 'Failed to authenticate with Stremio' });
    }

    // Pull user's addon collection from Stremio
    await apiStore.pullAddonCollection();

    // Create user record
    const userId = String(users.length + 1);
    const newUser = {
      id: userId,
      displayName,
      email,
      username: username || email.split('@')[0],
      stremioAuthKey: apiStore.authKey,
      stremioUser: apiStore.user,
      stremioAddons: apiStore.addons || {},
      role: 'user',
      status: 'active',
      groups: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUsers();

    // Don't send sensitive data back
    const responseUser = { ...newUser };
    delete responseUser.stremioAuthKey;

    res.status(201).json({
      message: 'Successfully connected to Stremio',
      user: responseUser,
      addonsCount: Object.keys(apiStore.addons || {}).length
    });

  } catch (error) {
    console.error('Stremio connection error:', error);
    res.status(401).json({ 
      message: 'Failed to connect to Stremio',
      error: error.message
    });
  }
});

app.get('/api/stremio/user/:id/addons', async (req, res) => {
  try {
    const { id } = req.params;
    const user = users.find(u => u.id === id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User not connected to Stremio' });
    }

    // Create API store with user's auth key
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => key === 'authKey' ? user.stremioAuthKey : null,
        setJSON: (key, value) => {}
      },
    });

    // Pull latest addons from Stremio
    await apiStore.pullAddonCollection();

    // Update user's addon collection
    user.stremioAddons = apiStore.addons || {};
    user.updatedAt = new Date().toISOString();
    await saveUsers();

    res.json({
      userId: id,
      addons: apiStore.addons || {},
      addonsCount: Object.keys(apiStore.addons || {}).length
    });

  } catch (error) {
    console.error('Failed to fetch user addons:', error);
    res.status(500).json({ 
      message: 'Failed to fetch addons from Stremio',
      error: error.message
    });
  }
});

app.post('/api/stremio/user/:id/addons/install', async (req, res) => {
  try {
    const { id } = req.params;
    const { addonUrl } = req.body;
    
    if (!addonUrl) {
      return res.status(400).json({ message: 'Addon URL is required' });
    }

    const user = users.find(u => u.id === id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.stremioAuthKey) {
      return res.status(400).json({ message: 'User not connected to Stremio' });
    }

    // Create API store with user's auth key
    const apiStore = new StremioAPIStore({
      endpoint: 'https://api.strem.io',
      storage: {
        getJSON: (key) => key === 'authKey' ? user.stremioAuthKey : null,
        setJSON: (key, value) => {}
      },
    });

    // Pull current addons
    await apiStore.pullAddonCollection();
    
    // Add the new addon
    apiStore.addons = apiStore.addons || {};
    apiStore.addons[addonUrl] = {
      url: addonUrl,
      installed: true,
      installedAt: new Date().toISOString()
    };

    // Push updated collection back to Stremio
    await apiStore.pushAddonCollection();

    // Update user's local copy
    user.stremioAddons = apiStore.addons;
    user.updatedAt = new Date().toISOString();
    await saveUsers();

    res.json({
      message: 'Addon installed successfully',
      addonUrl,
      addonsCount: Object.keys(apiStore.addons).length
    });

  } catch (error) {
    console.error('Failed to install addon:', error);
    res.status(500).json({ 
      message: 'Failed to install addon',
      error: error.message
    });
  }
});

// Enhanced Users API with Stremio integration
app.get('/api/users', (req, res) => {
  const safeUsers = users.map(user => {
    const { stremioAuthKey, ...safeUser } = user;
    return {
      ...safeUser,
      hasStremioConnection: !!stremioAuthKey,
      stremioAddonsCount: Object.keys(user.stremioAddons || {}).length
    };
  });
  res.json(safeUsers);
});

app.get('/api/users/search', (req, res) => {
  const { q, role } = req.query;
  let filtered = [...users];
  
  if (q) {
    filtered = filtered.filter(user => 
      user.username.toLowerCase().includes(q.toLowerCase()) ||
      user.email.toLowerCase().includes(q.toLowerCase())
    );
  }
  
  if (role && role !== 'all') {
    filtered = filtered.filter(user => user.role === role);
  }
  
  const safeUsers = filtered.map(user => {
    const { stremioAuthKey, ...safeUser } = user;
    return {
      ...safeUser,
      hasStremioConnection: !!stremioAuthKey,
      stremioAddonsCount: Object.keys(user.stremioAddons || {}).length
    };
  });
  
  res.json(safeUsers);
});

app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const index = users.findIndex(user => user.id === id);
  
  if (index === -1) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  users.splice(index, 1);
  await saveUsers();
  res.status(204).send();
});

// Addons API (enhanced with Stremio data)
app.get('/api/addons', (req, res) => {
  res.json(addons);
});

app.get('/api/addons/search', (req, res) => {
  const { q, category } = req.query;
  let filtered = [...addons];
  
  if (q) {
    filtered = filtered.filter(addon => 
      addon.name.toLowerCase().includes(q.toLowerCase()) ||
      addon.description.toLowerCase().includes(q.toLowerCase())
    );
  }
  
  if (category && category !== 'all') {
    filtered = filtered.filter(addon => addon.category === category);
  }
  
  res.json(filtered);
});

app.post('/api/addons', async (req, res) => {
  const { url, category } = req.body;
  
  if (!url || !category) {
    return res.status(400).json({ message: 'URL and category are required' });
  }
  
  // Extract addon name from URL (simplified)
  const name = url.split('/').pop().replace('.json', '').replace('manifest', 'Custom Addon');
  
  const newAddon = {
    id: String(addons.length + 1),
    name: name || 'New Addon',
    description: `Custom addon from ${url}`,
    url,
    category,
    status: 'active',
    users: 0,
    groups: 0,
    createdAt: new Date().toISOString()
  };
  
  addons.push(newAddon);
  await saveAddons();
  res.status(201).json(newAddon);
});

app.delete('/api/addons/:id', async (req, res) => {
  const { id } = req.params;
  const index = addons.findIndex(addon => addon.id === id);
  
  if (index === -1) {
    return res.status(404).json({ message: 'Addon not found' });
  }
  
  addons.splice(index, 1);
  await saveAddons();
  res.status(204).send();
});

// Groups API (placeholder for now)
app.get('/api/groups', (req, res) => {
  res.json(groups);
});

app.post('/api/groups', async (req, res) => {
  const { name, description, restrictions, color } = req.body;
  
  if (!name) {
    return res.status(400).json({ message: 'Group name is required' });
  }
  
  const newGroup = {
    id: String(groups.length + 1),
    name,
    description: description || '',
    members: 0,
    addons: 0,
    restrictions: restrictions || 'none',
    color: color || 'blue',
    created: new Date().toISOString()
  };
  
  groups.push(newGroup);
  await saveGroups();
  res.status(201).json(newGroup);
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Initialize and start server
async function startServer() {
  await ensureDataDir();
  await loadData();
  
  app.listen(PORT, () => {
    console.log(`🚀 Syncio backend running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🔌 API endpoints: http://localhost:${PORT}/api/`);
    console.log(`🎬 Stremio integration: ENABLED`);
    console.log(`💾 Storage: File-based (${DATA_DIR})`);
  });
}

startServer().catch(console.error);

module.exports = app;
