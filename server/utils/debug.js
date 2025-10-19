// Debug utility for conditional logging
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1'

const debug = {
  log: (...args) => {
    if (DEBUG) {
      console.log(...args)
    }
  },
  
  error: (...args) => {
    if (DEBUG) {
      console.error(...args)
    }
  },
  
  warn: (...args) => {
    if (DEBUG) {
      console.warn(...args)
    }
  },
  
  info: (...args) => {
    if (DEBUG) {
      console.info(...args)
    }
  }
}

module.exports = debug
