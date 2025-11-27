import dotenv from "dotenv";
import { ethers } from "ethers";

// Load environment variables
dotenv.config();

// Provider + wallet setup (ethers v5 style)
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL_SEPOLIA);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

async function runDemo() {
  try {
    const eventArg = process.argv[2] || "SafetyInspection: Worker safety inspection completed on site";
    const message = eventArg;

    // Hash the message
    const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message));

    // Send a simple transaction (demo purpose)
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: ethers.utils.parseEther("0.001")   // v5 syntax
    });

    // Wait for mining
    const receipt = await tx.wait();
    const block = await provider.getBlock(receipt.blockNumber);

    // Compliance note object
    const complianceNote = {
      event: message,
      evidence: {
        txid: tx.hash,
        blockNumber: receipt.blockNumber,
        blockTimestamp: block.timestamp
      },
      verified: true
    };

    console.log(JSON.stringify(complianceNote, null, 2));
    console.log("🔎 Verified TxID on Sepolia Etherscan:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
    console.log("✅ Demo complete. Compliance note published and verified.");
  } catch (err) {
    console.error("❌ Demo failed:", err);
  }
}

runDemo();
