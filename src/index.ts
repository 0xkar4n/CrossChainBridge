import dotenv from "dotenv";
import { ethers } from 'ethers';
import BridgeABI from "../abi/CrossChainBridge.json";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY as string; 

const SEPOLIA_WSS_URL = process.env.SEPOLIA_WS!;
const BASE_WSS_URL = process.env.BASE_SEPOLIA_WS!;

const SEPOLIA_CONTRACT_ADDRESS = process.env.SEPOLIA_BRIDGE_CONTRACT_ADDRESS!;
const BASE_CONTRACT_ADDRESS = process.env.BASE_BRIDGE_CONTRACT_ADDRESS!;

if (!PRIVATE_KEY) {
    console.error("Error: PRIVATE_KEY environment variable is not set. Please provide your wallet's private key.");
    process.exit(1);
}
if (!SEPOLIA_WSS_URL) {
    console.error("Error: SEPOLIA_WS environment variable is not set.");
    process.exit(1); 
}
if (!SEPOLIA_CONTRACT_ADDRESS) {
    console.error("Error: SEPOLIA_BRIDGE_CONTRACT_ADDRESS environment variable is not set.");
    process.exit(1); 
}

if (!BASE_WSS_URL) {
    console.error("Error: BASE_WS environment variable is not set.");
    process.exit(1); 
}
if (!BASE_CONTRACT_ADDRESS) {
    console.error("Error: BASE_BRIDGE_CONTRACT_ADDRESS environment variable is not set.");
    process.exit(1); 
}

const contractABI = BridgeABI;

async function main() {
    console.log('Starting smart contract event listener...');
    console.log(`Contract Address: ${SEPOLIA_CONTRACT_ADDRESS}`);
    console.log(`Contract Address: ${BASE_CONTRACT_ADDRESS}`);

    let sepoliaProvider: ethers.WebSocketProvider;
    let baseSepoliaProvider: ethers.WebSocketProvider;
     try {
        sepoliaProvider = new ethers.WebSocketProvider(SEPOLIA_WSS_URL);
        baseSepoliaProvider = new ethers.WebSocketProvider(BASE_WSS_URL)
        const sepoliaBlockNumber = await sepoliaProvider.getBlockNumber();
        const baseBlockNumber = await baseSepoliaProvider.getBlockNumber();
        console.log(`Successfully connected to sepolia network. Current block: ${sepoliaBlockNumber}`);
        console.log(`Successfully connected to base sepolia network. Current block: ${baseBlockNumber}`);
    } catch (error) {
        console.error('Failed to connect to WebSocket provider:', error);
        return; 
    }

    const sepoliaWallet = new ethers.Wallet(PRIVATE_KEY, sepoliaProvider);
    const baseSepoliaWallet = new ethers.Wallet(PRIVATE_KEY, baseSepoliaProvider);

    console.log(`Sepolia Wallet Address: ${sepoliaWallet.address}`);
    console.log(`Base Sepolia Wallet Address: ${baseSepoliaWallet.address}`);

    try {
        const sepoliaBalance = await sepoliaProvider.getBalance(sepoliaWallet.address);
        console.log(`Sepolia Wallet Balance: ${ethers.formatEther(sepoliaBalance)} ETH`);
        const baseSepoliaBalance = await baseSepoliaProvider.getBalance(baseSepoliaWallet.address);
        console.log(`Base Sepolia Wallet Balance: ${ethers.formatEther(baseSepoliaBalance)} ETH`);
        console.log("----------------------------------------------------------------------")
    } catch (error) {
        console.warn('Could not fetch wallet balances. Ensure wallet has funds and network is accessible.');
    }



  const sepoliaContract = new ethers.Contract(SEPOLIA_CONTRACT_ADDRESS, contractABI, sepoliaProvider);
  const baseContract = new ethers.Contract(BASE_CONTRACT_ADDRESS, contractABI, baseSepoliaProvider);

  console.log('Listening for events...');

//sepolia
  sepoliaContract.on('EthLocked', async(requestId, user, amount, timestamp,  destinationChain) => {
    console.log("----------------------------------------------------------------------")
    console.log('EthLocked Event on SEPOLIA chain:');
    console.log('Request ID:', requestId);
    console.log('User:', user);
    console.log('Amount:', ethers.formatEther(amount));
    console.log('Timestamp:', new Date(Number(timestamp) * 1000).toISOString()); 
    console.log('destinationChain:', destinationChain);
    console.log("----------------------------------------------------------------------")

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

            console.log("----------------------------------------------------------------------")

            const claimTx = await sepoliaContract.claimEth(requestId, tx.hash);
            console.log(`Claim transaction sent by relayer for Request ID ${requestId}: ${claimTx.hash}`);
            await claimTx.wait();
            console.log(`Claim transaction confirmed successfully for Request ID ${requestId}. Relayer has claimed the ETH.`);
            console.log("----------------------------------------------------------------------")

        } catch (txError) {
            console.error(`Failed to send transaction on Base Sepolia for Request ID ${requestId}:`, txError);
        }

  });

  sepoliaContract.on('EthClaimed', (requestId, user, amount, destinationTxHash, event) => {
    console.log("----------------------------------------------------------------------")
    console.log('EthClaimed Event:');
    console.log('Request ID:', requestId);
    console.log('User:', user);
    console.log('Amount:', ethers.formatEther(amount));
    console.log('Destination Tx Hash:', destinationTxHash);
  });

  sepoliaProvider.on('error', (err: any) => {
    console.error('WebSocket Error:', err);
  });


//base sepolia
    baseContract.on('EthLocked', async(requestId, user, amount, timestamp,  destinationChain) => {
    console.log("----------------------------------------------------------------------")
    console.log('EthLocked Event on BASE chain:');
    console.log('Request ID:', requestId);
    console.log('User:', user);
    console.log('Amount:', ethers.formatEther(amount));
    console.log('Timestamp:', new Date(Number(timestamp) * 1000).toISOString()); 
    console.log('destinationChain:', destinationChain);
    console.log("----------------------------------------------------------------------")

    console.log(`Attempting to transfer ${ethers.formatEther(amount)} ETH for Request ID ${requestId} to ${destinationChain}`);
   try {
            const tx = await sepoliaWallet.sendTransaction({
                to: user,
                value: amount,
                gasLimit: 300000 
            });

            console.log(`Transaction sent on Base Sepolia for Request ID ${requestId}: ${tx.hash}`);
            await tx.wait(); 
            console.log(`Transaction confirmed successfully on Base Sepolia for Request ID ${requestId}.`);

            console.log("----------------------------------------------------------------------")
            const claimTx = await baseContract.claimEth(requestId, tx.hash);
            console.log(`Claim transaction sent by relayer for Request ID ${requestId}: ${claimTx.hash}`);
            await claimTx.wait();
            console.log(`Claim transaction confirmed successfully for Request ID ${requestId}. Relayer has claimed the ETH.`);
            console.log("----------------------------------------------------------------------")

        } catch (txError) {
            console.error(`Failed to send transaction on Base Sepolia for Request ID ${requestId}:`, txError);
        }

  });

  baseContract.on('EthClaimed', (requestId, user, amount, destinationTxHash, event) => {
    console.log("----------------------------------------------------------------------")
    console.log('EthClaimed Event:');
    console.log('Request ID:', requestId);
    console.log('User:', user);
    console.log('Amount:', ethers.formatEther(amount));
    console.log('Destination Tx Hash:', destinationTxHash);
  });

  baseSepoliaProvider.on('error', (err: any) => {
    console.error('WebSocket Error:', err);
  });




  console.log("----------------------------------------------------------------------")
  console.log('Event listener initialized. Waiting for events...');
}

main().catch((error) => {
  console.error('Error in listener:', error);
});
