

# Commands & Workflow Checklist — COS™ Blockchain Compliance Tracker

This document outlines the reproducibility workflow for generating SHA‑256 hashes, submitting demo transactions, verifying TxIDs, and capturing screenshots.  
▶ For the full demo walkthrough, see the [Demo Video section in README.md](../readme.md).


---

## ⚙️ Environment Reminder
Before running demo scripts, copy `.env.example` → `.env` and add your own Infura Project ID and Sepolia PRIVATE_KEY.  
See `README.md` or `judge_instructions.md` for details.

---

## 1. Generate SHA‑256 Hashes (Local Terminal)

For each governance event, run:

**Linux/macOS:**
```bash
echo "SafetyInspection: Worker safety inspection completed on site" | sha256sum
```

**Windows (Command Prompt):**
```powershell
echo SafetyInspection: Worker safety inspection completed on site > event.txt
certutil -hashfile event.txt SHA256
```

**Node.js alternative (cross‑platform):**
```bash
node -e "const crypto=require('crypto'); const msg='SafetyInspection: Worker safety inspection completed on site'; console.log(crypto.createHash('sha256').update(msg).digest('hex'));"
```

---

## 2. Submit Demo Transaction (Blockchain Demo)

Run the demo script to publish a compliance note on Sepolia:

```bash
node demo.js "SafetyInspection: Worker safety inspection completed on site"
```

Expected output (note: `hash` must match Step 1):
```json
{
  "event": "SafetyInspection: Worker safety inspection completed on site",
  "hash": "f90d04055edc258a17232db4172cd206995de4fa244a017f523e83662060977f",
  "evidence": {
    "txid": "0x008f0fdf9c8f96b0d4ad5bbd0063723abbeda980767d02c62a95f279d737a82c",
    "blockNumber": 9718072,
    "blockTimestamp": 1764250824
  },
  "verified": true
}
```

---

## 3. Run Offline Fallback Demo (No Sepolia ETH)

If you don’t have Sepolia ETH or RPC credentials, use the fallback script:

```bash
node demo_plain.js "SafetyInspection: Worker safety inspection completed on site"
```

Expected output:
```json
{
  "event": "SafetyInspection: Worker safety inspection completed on site",
  "hash": "f90d04055edc258a17232db4172cd206995de4fa244a017f523e83662060977f",
  "verified": false,
  "note": "Local-only demo: no transaction submitted"
}
```

---

## 4. Verify Transaction

Open Sepolia Etherscan and paste the TxID from the demo output:  
Example:  
[https://sepolia.etherscan.io/tx/0x008f0fdf9c8f96b0d4ad5bbd0063723abbeda980767d02c62a95f279d737a82c](https://sepolia.etherscan.io/tx/0x008f0fdf9c8f96b0d4ad5bbd0063723abbeda980767d02c62a95f279d737a82c)

---

## 5. Capture Screenshots

Save terminal output, Etherscan verification, and audit table screenshots into:

```text
appendix/screenshots.md
```

Follow the structure:
- Local Hash Generation  
- Blockchain Demo Transaction  
- Sepolia Etherscan Verification  
- Offline Fallback Demo  
- Audit Table Entry (from audit_table.csv)  

---

▶ For the full demo walkthrough, see the [Demo Video section in README.md](../readme.md).


---

## ✅ Judge Checklist

By following this workflow, judges can:
- Generate and verify SHA‑256 hashes locally  
- Run blockchain demo and confirm TxID on Sepolia  
- Run offline fallback demo without Sepolia ETH  
- Capture reproducibility screenshots  
- Confirm audit table entries  
- Follow [judge_checklist.md](appendix/judge_checklist.md) for quick verification  
- Watch the demo video 


---
