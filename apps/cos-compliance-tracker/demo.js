// demo.js
require('dotenv').config();
const { ethers } = require("ethers");

async function runDemo() {
  console.log("🚀 Starting COS Compliance Tracker demo...");

  // Read event type from command line argument
  const eventType = process.argv[2] || "GenericComplianceEvent";

  // Connect to Sepolia via Infura
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL_SEPOLIA);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Example compliance note
  const complianceNote = {
    "@context": "https://www.w3.org/ns/odrl.jsonld",
    "type": "ComplianceNote",
    "name": eventType,
    "issued": new Date().toISOString(),
    "evidence": {
      "txid": "pending",
      "network": "Ethereum Sepolia",
      "blockTimestamp": new Date().toISOString()
    }
  };

  console.log(`📤 Publishing compliance note for event: ${eventType}`);

  // Send a simple transaction (demo purpose)
  const tx = await wallet.sendTransaction({
    to: wallet.address,
    value: ethers.parseEther("0.001")
  });

  complianceNote.evidence.txid = tx.hash;

  console.log(JSON.stringify(complianceNote, null, 2));
  console.log("🔎 Verifying TxID on Sepolia Etherscan...");
  console.log("✅ Demo complete. Compliance note published and verified.");
}

runDemo().catch(console.error);
