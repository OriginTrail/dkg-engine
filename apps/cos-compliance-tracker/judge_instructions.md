
# 🧑‍⚖️ Judge Instructions — COS™ Blockchain Compliance Tracker

This guide provides step‑by‑step instructions for verifying the reproducibility and ethics‑first commitments of the COS™ Blockchain Compliance Tracker submission.

---

## ✅ Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/Constructionmgmtpractitioner/dkg-engine.git
   cd dkg-engine/apps/cos-compliance-tracker
   npm install
   ```

2. **Configure environment**
   - Copy `.env.example` to `.env`
   - Add your **own Infura Project ID** and **Sepolia PRIVATE_KEY**
   - Example:
     ```env
     RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
     PRIVATE_KEY=0xYOUR_PRIVATE_KEY
     ```

⚠️ **Important:** This repository does **not** include private credentials.  
Judges must use their own Infura Project ID and Sepolia wallet key to reproduce the demo.

---

## 🚀 Demo Verification

Run demo script for governance events:

```bash
node demo.js "SafetyInspection: Worker safety inspection completed on site"
```

Expected output:
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

Run additional governance events:
```bash
node demo.js "QualityAudit: Independent quality audit completed"
node demo.js "EnvironmentalCheck: Environmental compliance check passed"
```

---

## 🖥️ Offline Fallback Demo

If you don’t have Sepolia ETH or Infura credentials:
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

## 🔍 TxID Verification

1. Copy a TxID from the demo output or `audit_table.csv`  
2. Paste into [Sepolia Etherscan](https://sepolia.etherscan.io/)  
3. Confirm block number and timestamp match demo output  

---

## 📊 Reproducibility Workflow

See `/appendix/commands.md` for the full reproducibility checklist:
- Generate SHA‑256 hashes  
- Submit demo transactions  
- Verify TxIDs on Sepolia  
- Record results in `audit_table.csv`  
- Capture screenshots in `screenshots.md`  
- Follow `judge_checklist.md`  

---

## 📊 DKG Integration (Optional Advanced Verification)

Scripts demonstrate publishing and querying compliance notes in the OriginTrail DKG.

- **Publish compliance notes**
  ```bash
  node src/dkg_publish.js
  ```
- **Query compliance notes**
  ```bash
  node src/mcp_query.js
  ```
- **Compute reputation scores**
  ```bash
  node src/reputation_score.js
  ```

---

## 🎥 Demo Video
The demo video illustrates the flow:  
**Governance Event → TxID → Etherscan Verification → DKG Note → Reputation Score → Dashboard View**

---

## ⚖️ Ethics‑First Commitments
- See `/docs/ethics_statement.md` for transparency, accountability, and sustainability principles  
- License: CC BY 4.0  
- Reproducibility assets: `audit_table.csv`, `commands.md`, `screenshots.md`, `judge_checklist.md`, plus demo narration and slides in `/docs`

---

## 📘 References
- COS™ Working Paper (Zenodo DOI): [10.5281/zenodo.17620309](https://doi.org/10.5281/zenodo.17620309)  
- Ethics Statement: `/docs/ethics_statement.md`  
- Roadmap: `/docs/roadmap.md`  
- Governance Framework: `/docs/governance_framework.md`  
- Challenge Alignment: `/docs/challenge_alignment.md`


---
