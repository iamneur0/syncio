/**
 * Centralized Stremio API utilities
 */

const { StremioAPIClient, StremioAPIStore } = require('stremio-api-client');

/**
 * Create a Stremio API client with auth key
 */
function createStremioClient(authKey) {
  return new StremioAPIClient({ authKey });
}

/**
 * Create a Stremio API store with temporary storage
 */
function createStremioStore() {
  const tempStorage = {
    user: null,
    auth: null,
    addons: []
  };

  const store = new StremioAPIStore({
    getJSON: (key) => tempStorage[key] || null,
    setJSON: (key, value) => { tempStorage[key] = value; }
  });

  return { store, tempStorage };
}

/**
 * Validate Stremio auth key by testing API calls
 */
async function validateStremioAuthKey(authKey) {
  try {
    const client = createStremioClient(authKey);
    const user = await client.getUser();
    const addons = await client.getAddonCollection();
    return { user, addons };
  } catch (error) {
    throw error;
  }
}

/**
 * Create Stremio API client and store together
 */
function createStremioAPI(authKey = null) {
  const client = authKey ? createStremioClient(authKey) : null;
  const { store, tempStorage } = createStremioStore();
  
  return {
    client,
    store,
    tempStorage,
    validateAuthKey: authKey ? () => validateStremioAuthKey(authKey) : null
  };
}

module.exports = {
  createStremioClient,
  createStremioStore,
  validateStremioAuthKey,
  createStremioAPI
};
