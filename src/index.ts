import dotenv from "dotenv";
import { ethers } from 'ethers';
import BridgeABI from "../abi/CrossChainBridge.json";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY as string; 
const WSS_URL = process.env.SEPOLIA_WS!;
const BASE_WSS_URL = process.env.BASE_SEPOLIA_WS!;

const CONTRACT_ADDRESS = process.env.SEPOLIA_BRIDGE_CONTRACT_ADDRESS!;

if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable is not set. Please provide your wallet's private key.");
    process.exit(1);
}
if (!WSS_URL) {
    console.error("Error: SEPOLIA_WS environment variable is not set.");
    process.exit(1); 
}
if (!CONTRACT_ADDRESS) {
    console.error("Error: SEPOLIA_BRIDGE_CONTRACT_ADDRESS environment variable is not set.");
    process.exit(1); 
}

const contractABI = BridgeABI;

async function main() {
  console.log('Starting smart contract event listener...');
    console.log(`WebSocket URL: ${WSS_URL}`);
    console.log(`Contract Address: ${CONTRACT_ADDRESS}`);

    let provider: ethers.WebSocketProvider;
    let baseSepoliaProvider: ethers.WebSocketProvider;
     try {
        provider = new ethers.WebSocketProvider(WSS_URL);
        baseSepoliaProvider = new ethers.WebSocketProvider(BASE_WSS_URL)
        const blockNumber = await provider.getBlockNumber();
        console.log(`Successfully connected to Ethereum network. Current block: ${blockNumber}`);
    } catch (error) {
        console.error('Failed to connect to WebSocket provider:', error);
        console.error('Please ensure your SEPOLIA_WS is correct and accessible.');
        return; 
    }

    const sepoliaWallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const baseSepoliaWallet = new ethers.Wallet(PRIVATE_KEY, baseSepoliaProvider);

    console.log(`Sepolia Wallet Address: ${sepoliaWallet.address}`);
    console.log(`Base Sepolia Wallet Address: ${baseSepoliaWallet.address}`);

    try {
        const sepoliaBalance = await provider.getBalance(sepoliaWallet.address);
        console.log(`Sepolia Wallet Balance: ${ethers.formatEther(sepoliaBalance)} ETH`);
        const baseSepoliaBalance = await baseSepoliaProvider.getBalance(baseSepoliaWallet.address);
        console.log(`Base Sepolia Wallet Balance: ${ethers.formatEther(baseSepoliaBalance)} ETH`);
    } catch (error) {
        console.warn('Could not fetch wallet balances. Ensure wallet has funds and network is accessible.');
    }



  const contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, provider);

  console.log('Listening for events...');

  contract.on('EthLocked', async(requestId, user, amount, timestamp, claimed, destinationChain) => {
    console.log('EthLocked Event:');
    console.log('Request ID:', requestId);
    console.log('User:', user);
    console.log('Amount:', ethers.formatEther(amount));
    console.log('Timestamp:', new Date(Number(timestamp) * 1000).toISOString()); 
    console.log('claimed:', claimed);
    console.log('destinationChain:', destinationChain);

    console.log(`Attempting to transfer ${ethers.formatEther(amount)} ETH for Request ID ${requestId} to ${destinationChain}`);
   try {
            const tx = await baseSepoliaWallet.sendTransaction({
                to: user,
                value: amount,
                gasLimit: 300000 
            });

            console.log(`Transaction sent on Base Sepolia for Request ID ${requestId}: ${tx.hash}`);
            await tx.wait(); 
            console.log(`Transaction confirmed successfully on Base Sepolia for Request ID ${requestId}.`);

        } catch (txError) {
            console.error(`Failed to send transaction on Base Sepolia for Request ID ${requestId}:`, txError);
        }

  });

  contract.on('EthClaimed', (requestId, user, amount, destinationTxHash, event) => {
    console.log('EthClaimed Event:');
    console.log('Request ID:', requestId);
    console.log('User:', user);
    console.log('Amount:', ethers.formatEther(amount));
    console.log('Destination Tx Hash:', destinationTxHash);
  });

  provider.on('error', (err: any) => {
    console.error('WebSocket Error:', err);
  });

  
  console.log('Event listener initialized. Waiting for events...');
}

main().catch((error) => {
  console.error('Error in listener:', error);
});
