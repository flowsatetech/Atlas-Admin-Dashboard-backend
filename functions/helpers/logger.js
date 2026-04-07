/** FOR ERROR ANALYTICS, UPDATE LATER */
const logger = (type) => {
  return {
    info: (info) => console.log(`[${type}_INFO]`, info),
    warn: (err) => console.warn(`[${type}_WARNING]`, err),
    error: (err) => console.error(`[${type}_ERROR]`, err),
  }
}

module.exports = logger