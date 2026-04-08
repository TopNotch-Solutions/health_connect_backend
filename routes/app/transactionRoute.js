const { Router } = require('express');
const {fundSomeonesWallet, wallet2Wallet, withdrawal, all, getAllTransactions, allEarnings, purchasePackage } = require('../../controllers/app/transactionController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');
const transactionRouter = Router();

transactionRouter.post("/purchase-package",tokenAuthMiddleware,checkUser, purchasePackage);
transactionRouter.post("/fund-other-wallet",tokenAuthMiddleware,checkUser, fundSomeonesWallet);
transactionRouter.post("/wallet-wallet-transfer",tokenAuthMiddleware,checkUser, wallet2Wallet);
transactionRouter.post("/withdraw-wallet-funds",tokenAuthMiddleware,checkUser, withdrawal);
transactionRouter.get("/transaction-history",tokenAuthMiddleware,checkUser, all);
transactionRouter.get("/all-transactions", getAllTransactions);
transactionRouter.get("/earnings", tokenAuthMiddleware, checkUser, allEarnings);

module.exports = transactionRouter;