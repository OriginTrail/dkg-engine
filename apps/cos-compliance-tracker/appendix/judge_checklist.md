
# 🧑‍⚖️ Judge Checklist — COS™ Blockchain Compliance Tracker

This checklist provides a reference for verifying the reproducibility and ethics‑first commitments of the COS™ Blockchain Compliance Tracker submission.

---

## ✅ Setup
The setup process involves cloning the repository, installing dependencies, and configuring environment variables.

1. Clone the repository:
```bash
git clone https://github.com/Constructionmgmtpractitioner/dkg-engine.git
cd dkg-engine/apps/cos-compliance-tracker
npm install
```

2. Configure environment:
- Copy `.env.example` to `.env`
- Add your **Infura Project ID** and **Sepolia PRIVATE_KEY**
```env
RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

⚠️ **Important:** This repository does **not** include private credentials. Judges must use their own Infura Project ID and Sepolia wallet key to reproduce the demo.

---

## 🚀 Demo Verification
The demo scripts illustrate how governance events are logged and verified.

Run demo script:
```bash
node demo.js "SafetyInspection: Worker safety inspection completed on site"
```

Outputs governance event, SHA‑256 hash, TxID, block number, and timestamp.

Run additional governance events:
```bash
node demo.js "QualityAudit: Independent quality audit completed"
node demo.js "EnvironmentalCheck: Environmental compliance check passed"
```

Fallback demo (plain‑text):
```bash
node demo_plain.js "SafetyInspection: Worker safety inspection completed on site"
```

Provides simplified outputs for universal compatibility.

---

## 🔍 TxID Verification
1. Copy a TxID from the demo output or `audit_table.csv`  
2. Paste into [Sepolia Etherscan](https://sepolia.etherscan.io/)  
3. Confirm block number and timestamp match demo output  

---

## 📊 Reproducibility Workflow
See appendix files for reproducibility assets:
- [commands.md](appendix/commands.md) — step‑by‑step workflow  
- [audit_table.csv](appendix/audit_table.csv) — reproducibility ledger  
- [screenshots.md](appendix/screenshots.md) — screenshot evidence  
- [jsonld_examples.md](appendix/jsonld_examples.md) — structured JSON‑LD compliance notes  
- [judge_checklist.md](appendix/judge_checklist.md) — this checklist  

Judges should confirm:
- Local SHA‑256 hash matches demo outputs  
- TxID and block details match Sepolia Etherscan verification  
- Offline fallback demo shows reproducibility without blockchain submission  
- Audit table entries correspond to verified transactions  
- **JSON‑LD structured examples in `appendix/jsonld_examples.md` match audit table and Sepolia evidence**  
- **Screenshot6.png shows JSON‑LD compliance note aligned with audit_table.csv and Sepolia verification**

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

▶ For the full demo walkthrough, see the [Demo Video section in README.md](../readme.md).
The demo video illustrates the flow:  
**Governance Event → TxID → Etherscan Verification → Audit Table → JSON‑LD Note → Reputation Score → Dashboard View**

---

## ⚖️ Ethics‑First Commitments
- See `/docs/ethics_statement.md` for transparency, accountability, and sustainability principles  
- License: CC BY 4.0  
- Reproducibility assets: `audit_table.csv`, `commands.md`, `screenshots.md`, `jsonld_examples.md`, `judge_checklist.md`  

---

## 📘 References
- COS™ Working Paper (Zenodo DOI): [10.5281/zenodo.17620309](https://doi.org/10.5281/zenodo.17620309)  
- Ethics Statement: `/docs/ethics_statement.md`  
- Roadmap: `/docs/roadmap.md`  
- Governance Framework: `/docs/governance_framework.md`  
- Challenge Alignment: `/docs/challenge_alignment.md`

---

