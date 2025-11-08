const { Router } = require('express');
const { fundOwnWallet, fundSomeonesWallet, wallet2Wallet, withdrawal, all } = require('../../controllers/app/transactionController');
const transactionRouter = Router();

transactionRouter.post("/fund-wallet/:id", fundOwnWallet);
transactionRouter.post("/fund-other-wallet/:id", fundSomeonesWallet);
transactionRouter.post("/wallet-wallet-transfer/:id", wallet2Wallet);
transactionRouter.post("/withdraw-wallet-funds/:id", withdrawal);
transactionRouter.get("/transaction-history/:id", all);

module.exports = transactionRouter;