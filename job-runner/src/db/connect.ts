import mongoose from "mongoose";
import { config } from "../config";
// import { createWalletSnapshot } from "../run";
// // import {analyzeCoinFlows  } from "../token";
// import { analyzeNFTMovements, NFTConfig } from '../nft';

export async function connectDB() {
  await mongoose.connect(config.mongoUri);
  console.log("✅ MongoDB connected");

//   const wallet = "0xDc78B593dD44914C326D1ed375d48c4C5628";
//   await createWalletSnapshot(wallet);

// const config2 = {
//   address: '0x000f889c0216e7ed5eb5b8696a341d48ee41acca',
//   name: 'DogeCoin',
//   symbol: 'DOGE',
//   thresholds: {
//     largeTransfer: 1000000,
//     whalePercentage: 5,
//     volumeSpike: 50
//   },
//   watchedAddresses: ["0x5FbE74A283f7954f10AA04C2eDf55578811aeb03"]
// };

// const dongleNFTConfig: NFTConfig = {
//   address: '0x7b5760da5e05ec0f3da2284fb22e62f6bd5dae5f',
//   name: 'Dongle',
//   symbol: 'DONGLE',
//   thresholds: {
//     massTransferCount: 10,        // Alert if more than 10 transfers in 1 hour
//     whaleTokenCount: 50,          // Alert if someone holds more than 50 tokens
//     suspiciousMintRate: 20,       // Alert if more than 20 mints per hour
//     highActivitySpike: 200        // Alert if activity increases by 200%
//   },
//   watchedAddresses: [
//     '0x166Ca4Ac1e31BFA09Daf41c1cb9F06b700719A59',  // Example watched wallet
//     '0xE8513F80fe8969c44A597e9e16A565b6855037dc',  // Another example watched wallet
//     // Add any wallets you want to monitor
//   ]
// };


// // const snapshot = await analyzeCoinFlows(config2);

//   const snapshot = await analyzeNFTMovements(dongleNFTConfig, {
//       apiEndpoint: 'https://api.testnet.seistream.app',
//       transactionLimit: 25
//     });

}
