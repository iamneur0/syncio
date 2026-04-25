/**
 * Stremio Watched Bitfield Decoder
 * 
 * Decodes the watched field from Stremio library items
 * Format: {lastVideoID}:{lastLength}:{serializedBuf}
 * Example: tt25274446:2:5:14:eJz7b8/AAAAEvQE/
 */

const zlib = require('zlib');

/**
 * Decode a Stremio watched bitfield string
 * @param {string} watchedStr - The watched field value
 * @returns {Object} Decoded information
 */
function decodeWatchedBitfield(watchedStr) {
  if (!watchedStr || typeof watchedStr !== 'string') {
    return null;
  }

  const parts = watchedStr.split(':');
  if (parts.length < 4) {
    return { raw: watchedStr, error: 'Invalid format' };
  }

  // Parse components
  const lastVideoId = parts.slice(0, 3).join(':'); // tt25274446:2:5
  const lastLength = parseInt(parts[3], 10); // 14
  const serializedBuf = parts[4]; // eJz7b8/AAAAEvQE/

  if (!serializedBuf) {
    return { lastVideoId, lastLength, error: 'No bitfield data' };
  }

  try {
    // Decode base64
    const compressed = Buffer.from(serializedBuf, 'base64');
    
    // Decompress using zlib (pako/inflate)
    const bitfield = zlib.inflateSync(compressed);
    
    // Convert to array of booleans (watched status per episode)
    const watchedEpisodes = [];
    for (let i = 0; i < bitfield.length; i++) {
      const byte = bitfield[i];
      for (let j = 0; j < 8; j++) {
        const episodeIndex = i * 8 + j;
        if (episodeIndex >= lastLength) break;
        watchedEpisodes.push({
          episode: episodeIndex + 1,
          watched: (byte & (1 << j)) !== 0
        });
      }
    }

    return {
      lastVideoId,
      lastLength,
      serializedBuf,
      watchedEpisodes,
      watchedCount: watchedEpisodes.filter(e => e.watched).length
    };
  } catch (error) {
    return {
      lastVideoId,
      lastLength,
      serializedBuf,
      error: error.message
    };
  }
}

/**
 * Parse a library item and extract watched episode info
 * @param {Object} libraryItem - Stremio library item
 * @returns {Object} Parsed info
 */
function parseLibraryItemWatched(libraryItem) {
  if (!libraryItem?.state?.watched) {
    return null;
  }

  const decoded = decodeWatchedBitfield(libraryItem.state.watched);
  
  return {
    showId: libraryItem._id,
    showName: libraryItem.name,
    type: libraryItem.type,
    lastWatched: libraryItem.state.lastWatched,
    timesWatched: libraryItem.state.timesWatched,
    timeWatched: libraryItem.state.timeWatched,
    duration: libraryItem.state.duration,
    ...decoded
  };
}

// Example usage with your data
const example = {
  "_id": "tt25274446",
  "removed": true,
  "temp": true,
  "_ctime": "2026-01-26T19:03:56.776496Z",
  "_mtime": "2026-02-07T20:52:50.693967Z",
  "state": {
    "lastWatched": "2026-02-07T20:52:50.615314Z",
    "timeWatched": 3021018,
    "timeOffset": 3021019,
    "overallTimeWatched": 102975926,
    "timesWatched": 14,
    "flaggedWatched": 1,
    "duration": 3259000,
    "video_id": "tt25274446:2:5",
    "watched": "tt25274446:2:5:14:eJz7b8/AAAAEvQE/",
    "noNotif": false,
    "season": 0,
    "episode": 0
  },
  "name": "Physical: 100",
  "type": "series",
  "poster": "https://api.ratingposterdb.com/t0-free-rpdb/imdb/poster-default/tt25274446.jpg?fallback=true",
  "posterShape": "poster",
  "background": "",
  "logo": "",
  "year": ""
};

console.log('=== Stremio Watched Bitfield Decoder ===\n');
console.log('Input:', example.state.watched);
console.log('');

const result = parseLibraryItemWatched(example);
console.log('Decoded Result:');
console.log(JSON.stringify(result, null, 2));

// Export for use in other modules
module.exports = {
  decodeWatchedBitfield,
  parseLibraryItemWatched
};
