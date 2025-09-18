// Debug utility for conditional logging
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NEXT_PUBLIC_DEBUG === '1'

export const debug = {
  log: (...args: any[]) => {
    if (DEBUG) {
      console.log(...args)
    }
  },
  
  error: (...args: any[]) => {
    if (DEBUG) {
      console.error(...args)
    }
  },
  
  warn: (...args: any[]) => {
    if (DEBUG) {
      console.warn(...args)
    }
  },
  
  info: (...args: any[]) => {
    if (DEBUG) {
      console.info(...args)
    }
  }
}
