
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
   ```bash
   RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
   PRIVATE_KEY=0xYOUR_PRIVATE_KEY
   ```

⚠️ **Important:** This repository does **not** include private credentials.  
Judges must use their own Infura Project ID and Sepolia wallet key to reproduce the demo.

---

## 🚀 Demo Verification

Run demo script for governance events:

```bash
node apps/cos-compliance-tracker/demo.js "SafetyInspection"
node apps/cos-compliance-tracker/demo.js "QualityAudit"
node apps/cos-compliance-tracker/demo.js "EnvironmentalCheck"
```

**Outputs include:** Event · SHA‑256 Hash · TxID · Block Number · Timestamp

Fallback demo (plain‑text):
```bash
npm run demo:plain
```
Provides simplified outputs for universal compatibility.

---

## 🔍 TxID Verification

1. Copy a TxID from the demo output or `/appendix/audit_table.csv`  
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
- Follow judge checklist

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
- Reproducibility assets: `/appendix/audit_table.csv`, `/appendix/commands.md`, `/docs/demo_narration.md`, `/docs/demo_slides.md`, `/docs/demo_storyboard.md`, `/docs/demo_timing.md`

---

## 📘 References
- COS™ Working Paper (Zenodo DOI): [10.5281/zenodo.17620309](https://doi.org/10.5281/zenodo.17620309)  
- Ethics Statement: `/docs/ethics_statement.md`  
- Roadmap: `/docs/roadmap.md`  
- Governance Framework: `/docs/governance_framework.md`  
- Challenge Alignment: `/docs/challenge_alignment.md`
```

