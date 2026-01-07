const { Router } = require('express');
const { fundOwnWallet, fundSomeonesWallet, wallet2Wallet, withdrawal, all, getAllTransactions } = require('../../controllers/app/transactionController');
const { tokenAuthMiddleware, checkUser } = require('../../middlewares/authMiddleware');
const transactionRouter = Router();

transactionRouter.post("/fund-wallet",tokenAuthMiddleware,checkUser, fundOwnWallet);
transactionRouter.post("/fund-other-wallet",tokenAuthMiddleware,checkUser, fundSomeonesWallet);
transactionRouter.post("/wallet-wallet-transfer",tokenAuthMiddleware,checkUser, wallet2Wallet);
transactionRouter.post("/withdraw-wallet-funds",tokenAuthMiddleware,checkUser, withdrawal);
transactionRouter.get("/transaction-history",tokenAuthMiddleware,checkUser, all);
transactionRouter.get("/all-transactions",tokenAuthMiddleware,checkUser, getAllTransactions);

module.exports = transactionRouter;