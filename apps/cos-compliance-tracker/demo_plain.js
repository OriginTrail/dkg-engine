import { ethers } from "ethers";

async function runDemo() {
  try {
    const eventArg = process.argv[2] || "SafetyInspection: Worker safety inspection completed on site";
    const message = eventArg;

    // Hash the message (no blockchain transaction)
    const hash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(message));

    // Compliance note (local-only)
    const complianceNote = {
      event: message,
      hash: hash,
      verified: false,
      note: "Local-only demo: no transaction submitted"
    };

    console.log(JSON.stringify(complianceNote, null, 2));
    console.log("✅ Demo complete (local-only).");
  } catch (err) {
    console.error("❌ Demo failed:", err);
  }
}

runDemo();
