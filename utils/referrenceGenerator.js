const generateTransactionReference = () => {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `TXN-${timestamp}-${randomPart}`;
};

module.exports = generateTransactionReference;