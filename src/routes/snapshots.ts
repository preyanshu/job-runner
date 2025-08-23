import { FastifyInstance } from "fastify";
import { WalletSnapshot } from "../models/WalletSnapshot";
import { NFTSnapshot } from "../models/NFTSnapshot";
import { MemeCoinSnapshot } from "../models/MemeCoinSnapshot";
import { createWalletSnapshot } from "../services/run";
import { analyzeCoinFlows } from "../services/token";
import { analyzeNFTMovements } from "../services/nft";

export default async function snapshotRoutes(fastify: FastifyInstance) {
  
  // Get latest wallet snapshot
  fastify.get("/snapshots/wallet/:address", async (request, reply) => {
    const { address } = request.params as { address: string };
    
    try {
      // Try to get the latest snapshot
      let snapshot = await WalletSnapshot.findOne({ walletAddress: address })
        .sort({ createdAt: -1 })
        .limit(1);

      // If no snapshot exists, generate one on the fly by calling the exact function
      if (!snapshot) {
        console.log(`📊 No snapshot found for wallet ${address}, calling createWalletSnapshot function...`);
        
        try {
          // Call the exact function that would be called in a job
          const result = await createWalletSnapshot(address);
          console.log(`✅ createWalletSnapshot function completed successfully for ${address}`);
          
          // Fetch the newly created snapshot
          snapshot = await WalletSnapshot.findOne({ walletAddress: address })
            .sort({ createdAt: -1 })
            .limit(1);
            
          if (!snapshot) {
            return reply.status(500).send({
              success: false,
              error: "Function executed successfully but no snapshot was created",
              details: {
                message: "createWalletSnapshot function completed but snapshot not found in database",
                timestamp: new Date(),
                walletAddress: address,
                function: "createWalletSnapshot",
                result: result
              }
            });
          }
        } catch (functionError) {
          console.error(`❌ createWalletSnapshot function failed for ${address}:`, functionError);
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate wallet snapshot",
            details: {
              message: functionError instanceof Error ? functionError.message : String(functionError),
              stack: functionError instanceof Error ? functionError.stack : undefined,
              timestamp: new Date(),
              walletAddress: address,
              function: "createWalletSnapshot",
              functionError: functionError instanceof Error ? {
                name: functionError.name,
                message: functionError.message,
                stack: functionError.stack
              } : String(functionError)
            }
          });
        }
      }

      if (!snapshot) {
        return reply.status(404).send({ 
          success: false,
          error: "Failed to generate wallet snapshot",
          walletAddress: address
        });
      }

      return {
        success: true,
        data: snapshot,
        generated: (snapshot as any).createdAt > new Date(Date.now() - 60000) // Generated in last minute
      };
    } catch (error) {
      console.error("❌ Error getting wallet snapshot:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get wallet snapshot",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get latest NFT snapshot for a collection
  fastify.get("/snapshots/nft/:collectionAddress", async (request, reply) => {
    const { collectionAddress } = request.params as { collectionAddress: string };
    
    try {
      // Try to get the latest snapshot
      let snapshot = await NFTSnapshot.findOne({ tokenAddress: collectionAddress })
        .sort({ createdAt: -1 })
        .limit(1);

      // If no snapshot exists, generate one on the fly by calling the exact function
      if (!snapshot) {
        console.log(`🖼️ No NFT snapshot found for collection ${collectionAddress}, calling analyzeNFTMovements function...`);
        
        try {
          const config = {
            address: collectionAddress,
            name: "Unknown Collection",
            symbol: "UNKNOWN",
            thresholds: {
              massTransferCount: 10,
              whaleTokenCount: 100,
              suspiciousMintRate: 50,
              highActivitySpike: 300
            },
            watchedAddresses: []
          };
          
          // Call the exact function that would be called in a job
          const result = await analyzeNFTMovements(config, {});
          console.log(`✅ analyzeNFTMovements function completed successfully for ${collectionAddress}`);
          
          // Fetch the newly created snapshot
          snapshot = await NFTSnapshot.findOne({ tokenAddress: collectionAddress })
            .sort({ createdAt: -1 })
            .limit(1);
            
          if (!snapshot) {
            return reply.status(500).send({
              success: false,
              error: "Function executed successfully but no snapshot was created",
              details: {
                message: "analyzeNFTMovements function completed but snapshot not found in database",
                timestamp: new Date(),
                collectionAddress,
                function: "analyzeNFTMovements",
                result: result
              }
            });
          }
        } catch (functionError) {
          console.error(`❌ analyzeNFTMovements function failed for ${collectionAddress}:`, functionError);
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate NFT snapshot",
            details: {
              message: functionError instanceof Error ? functionError.message : String(functionError),
              stack: functionError instanceof Error ? functionError.stack : undefined,
              timestamp: new Date(),
              collectionAddress,
              function: "analyzeNFTMovements",
              functionError: functionError instanceof Error ? {
                name: functionError.name,
                message: functionError.message,
                stack: functionError.stack
              } : String(functionError)
            }
          });
        }
      }

      if (!snapshot) {
        return reply.status(404).send({ 
          success: false,
          error: "Failed to generate NFT snapshot",
          collectionAddress
        });
      }

      return {
        success: true,
        data: snapshot,
        generated: (snapshot as any).createdAt > new Date(Date.now() - 60000) // Generated in last minute
      };
    } catch (error) {
      console.error("❌ Error getting NFT snapshot:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get NFT snapshot",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get latest memecoin snapshot
  fastify.get("/snapshots/memecoin/:tokenAddress", async (request, reply) => {
    const { tokenAddress } = request.params as { tokenAddress: string };
    
    try {
      // Try to get the latest snapshot
      let snapshot = await MemeCoinSnapshot.findOne({ tokenAddress })
        .sort({ createdAt: -1 })
        .limit(1);

      // If no snapshot exists, generate one on the fly by calling the exact function
      if (!snapshot) {
        console.log(`🪙 No memecoin snapshot found for token ${tokenAddress}, calling analyzeCoinFlows function...`);
        
        try {
          const config = {
            address: tokenAddress,
            name: "Unknown Token",
            symbol: "UNKNOWN",
            thresholds: {
              largeTransfer: 10000,
              whalePercentage: 5,
              volumeSpike: 200
            },
            watchedAddresses: []
          };
          
          // Call the exact function that would be called in a job
          const result = await analyzeCoinFlows(config, {});
          console.log(`✅ analyzeCoinFlows function completed successfully for ${tokenAddress}`);
          
          // Fetch the newly created snapshot
          snapshot = await MemeCoinSnapshot.findOne({ tokenAddress })
            .sort({ createdAt: -1 })
            .limit(1);
            
          if (!snapshot) {
            return reply.status(500).send({
              success: false,
              error: "Function executed successfully but no snapshot was created",
              details: {
                message: "analyzeCoinFlows function completed but snapshot not found in database",
                timestamp: new Date(),
                tokenAddress,
                function: "analyzeCoinFlows",
                result: result
              }
            });
          }
        } catch (functionError) {
          console.error(`❌ analyzeCoinFlows function failed for ${tokenAddress}:`, functionError);
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate memecoin snapshot",
            details: {
              message: functionError instanceof Error ? functionError.message : String(functionError),
              stack: functionError instanceof Error ? functionError.stack : undefined,
              timestamp: new Date(),
              tokenAddress,
              function: "analyzeCoinFlows",
              functionError: functionError instanceof Error ? {
                name: functionError.name,
                message: functionError.message,
                stack: functionError.stack
              } : String(functionError)
            }
          });
        }
      }

      if (!snapshot) {
        return reply.status(404).send({ 
          success: false,
          error: "Failed to generate memecoin snapshot",
          tokenAddress
        });
      }

      return {
        success: true,
        data: snapshot,
        generated: (snapshot as any).createdAt > new Date(Date.now() - 60000) // Generated in last minute
      };
    } catch (error) {
      console.error("❌ Error getting memecoin snapshot:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get memecoin snapshot",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get all latest snapshots for a wallet (wallet + NFTs + memecoins)
  fastify.get("/snapshots/wallet/:address/all", async (request, reply) => {
    const { address } = request.params as { address: string };
    
    try {
      // Get wallet snapshot
      let walletSnapshot = await WalletSnapshot.findOne({ walletAddress: address })
        .sort({ createdAt: -1 })
        .limit(1);

      if (!walletSnapshot) {
        console.log(`📊 Generating wallet snapshot for ${address}...`);
        try {
          // Call the exact function that would be called in a job
          const result = await createWalletSnapshot(address);
          console.log(`✅ createWalletSnapshot function completed successfully for ${address}`);
          
          walletSnapshot = await WalletSnapshot.findOne({ walletAddress: address })
            .sort({ createdAt: -1 })
            .limit(1);
        } catch (functionError) {
          console.error(`❌ createWalletSnapshot function failed for ${address}:`, functionError);
          
          return reply.status(500).send({
            success: false,
            error: "Failed to generate wallet snapshot",
            details: {
              message: functionError instanceof Error ? functionError.message : String(functionError),
              stack: functionError instanceof Error ? functionError.stack : undefined,
              timestamp: new Date(),
              walletAddress: address,
              function: "createWalletSnapshot",
              functionError: functionError instanceof Error ? {
                name: functionError.name,
                message: functionError.message,
                stack: functionError.stack
              } : String(functionError)
            }
          });
        }
      }

      // Get NFT snapshots where this wallet is involved
      const nftSnapshots = await NFTSnapshot.find({
        $or: [
          { "transferHistory.from": address },
          { "transferHistory.to": address },
          { "currentHolders": address }
        ]
      }).sort({ createdAt: -1 }).limit(10);

      // Get memecoin snapshots where this wallet is involved
      const memecoinSnapshots = await MemeCoinSnapshot.find({
        $or: [
          { "transferHistory.from": address },
          { "transferHistory.to": address },
          { "topHolders.address": address }
        ]
      }).sort({ createdAt: -1 }).limit(10);

      return {
        success: true,
        data: {
          wallet: walletSnapshot,
          nfts: nftSnapshots,
          memecoins: memecoinSnapshots
        },
        generated: (walletSnapshot as any)?.createdAt > new Date(Date.now() - 60000)
      };
    } catch (error) {
      console.error("❌ Error getting all snapshots:", error);
      return reply.status(500).send({ 
        success: false,
        error: "Failed to get all snapshots",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get snapshot statistics
  fastify.get("/snapshots/stats", async (request, reply) => {
    try {
      const [walletCount, nftCount, memecoinCount] = await Promise.all([
        WalletSnapshot.countDocuments(),
        NFTSnapshot.countDocuments(),
        MemeCoinSnapshot.countDocuments()
      ]);

      const [latestWallet, latestNFT, latestMemecoin] = await Promise.all([
        WalletSnapshot.findOne().sort({ createdAt: -1 }),
        NFTSnapshot.findOne().sort({ createdAt: -1 }),
        MemeCoinSnapshot.findOne().sort({ createdAt: -1 })
      ]);

      return {
        success: true,
        data: {
          counts: {
            wallets: walletCount,
            nfts: nftCount,
            memecoins: memecoinCount
          },
          latest: {
            wallet: (latestWallet as any)?.createdAt,
            nft: (latestNFT as any)?.createdAt,
            memecoin: (latestMemecoin as any)?.createdAt
          }
        }
      };
    } catch (error) {
      console.error("❌ Error getting snapshot stats:", error);
      return reply.status(500).send({ error: "Failed to get snapshot stats" });
    }
  });
} 