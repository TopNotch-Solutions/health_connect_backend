const walletIDGenerator = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
    let result = '';
    const length = 7;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

module.exports = walletIDGenerator;