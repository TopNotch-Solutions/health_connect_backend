/**
 * Shared Socket.IO accessor so portal controllers can broadcast
 * without importing server.js (avoids circular requires).
 */
let ioInstance = null;

const setIO = (io) => {
  ioInstance = io;
};

const getIO = () => ioInstance;

/**
 * Notify connected apps that portal catalog data changed
 * (ailments, ICD-10/NAMAF, medical aids). Apps invalidate caches and refetch.
 */
const emitCatalogUpdated = (type = "catalog") => {
  if (!ioInstance) return;
  ioInstance.emit("catalogUpdated", {
    type: String(type || "catalog"),
    at: new Date().toISOString(),
  });
};

module.exports = {
  setIO,
  getIO,
  emitCatalogUpdated,
};
