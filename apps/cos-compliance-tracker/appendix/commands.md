
```markdown
# Commands & Workflow Checklist — COS™ Blockchain Compliance Tracker

This document outlines the reproducibility workflow for generating SHA‑256 hashes, submitting demo transactions, verifying Tx IDs, and capturing screenshots.

---

## 1. Generate SHA‑256 Hashes (Local Terminal)
For each governance event, run:
```bash
echo "SafetyInspection: Worker safety inspection completed on site" | sha256sum
```

---

## 2. Submit Demo Transaction (Node.js Script)
Run the demo script to publish a compliance note on Sepolia:
```bash
node apps/cos-compliance-tracker/demo.js "SafetyInspection: Worker safety inspection completed on site"
```
Expected output:

json
{
  "event": "SafetyInspection: Worker safety inspection completed on site",
  "evidence": {
    "txid": "0x0d5d8c40d3469cf3be650b3a620a7469d4bc3e8948dc162bb36f8aaf90c7e2a5",
    "blockNumber": 9716122,
    "blockTimestamp": 1764226680
  },
  "verified": true
}

---

## 3. Run Offline Fallback Demo (no Sepolia ETH)
If you don’t have Sepolia ETH or RPC credentials, use the fallback script:
```bash
node apps/cos-compliance-tracker/demo_plain.js "SafetyInspection: Worker safety inspection completed on site"
```
Expected output:

json
{
  "event": "SafetyInspection: Worker safety inspection completed on site",
  "hash": "0x8f3d...abcd",
  "verified": false,
  "note": "Local-only demo: no transaction submitted"
}

---

## 4. Verify Transaction
Open Sepolia Etherscan and paste the TxID from the demo output:
- Example: https://sepolia.etherscan.io/tx/<TxHash>

---

## 5. Capture Screenshots
Save terminal output and Etherscan verification screenshots into:
```
apps/cos-compliance-tracker/appendix/screenshots.md
```
```

