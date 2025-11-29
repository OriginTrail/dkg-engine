
# 🧑‍⚖️ Judge Instructions — COS™ Blockchain Compliance Tracker

Welcome, judges 👋 — this guide explains how to verify the COS™ Blockchain Compliance Tracker prototype.  
It demonstrates transparent, reproducible compliance tracking using SHA‑256 hashing, Sepolia blockchain evidence, and structured JSON‑LD examples.

---

## 📌 Problem Statement & Motivation
Auditors, regulators, and stakeholders need transparent, reproducible compliance evidence.  
This tracker ensures every governance event is logged with a SHA‑256 hash, blockchain TxID, block number, and timestamp — all reproducible locally.

---

## ⚙️ Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/Constructionmgmtpractitioner/dkg-engine.git
   cd dkg-engine/apps/cos-compliance-tracker
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment:
   - Copy `.env.example` → `.env`
   - Add your Sepolia RPC URL (`RPC_URL_SEPOLIA`) and private key (`PRIVATE_KEY`).

---

## 🧪 Demo Scripts
### Blockchain Demo (`demo.js`)
Run:
```bash
node demo.js "SafetyInspection: Worker safety inspection completed on site"
```
Outputs:
- Event name
- SHA‑256 hash
- TxID
- Block number
- Block timestamp
- Verification status

Verify TxID on Sepolia Etherscan:
```
https://sepolia.etherscan.io/tx/<txid>
```

### Offline Fallback (`demo_plain.js`)
Run:
```bash
node demo_plain.js "SafetyInspection: Worker safety inspection completed on site"
```
Outputs:
- Event name
- SHA‑256 hash
- Verification status (local only)

---

## 📊 Reproducibility Assets
- **audit_table.csv** → Logs all governance events with SHA‑256 hash, TxID, block details, and verification.  
- **screenshots.md + screenshot5.png** → Visual evidence of audit table entries.  
- **judge_checklist.md** → Step‑by‑step reproducibility checklist.  
- **commands.md** → CLI commands for hash verification.

---

## 🧑‍💻 Agent Behavior (JSON‑LD Example)
Judges can verify structured compliance notes in JSON‑LD format.  
This ensures interoperability, machine readability, and alignment with DKG agent behavior.

```json
{
  "@context": {
    "schema": "http://schema.org/",
    "cos": "https://neoplan.consult/schema/cos#"
  },
  "@id": "cos:SafetyInspection2025-11-27",
  "@type": "cos:ComplianceNote",
  "schema:name": "SafetyInspection: Worker safety inspection completed on site",
  "schema:identifier": "4be76f5ab25de6656c0c2837c7daddba53c74ea4ed59ce33f20425c185a16f82",
  "cos:evidence": {
    "cos:txid": "0xbcba824f947338957ca3f9afb02abb37aba9dde7750f4f2b998baedcdc69aab3",
    "cos:blockNumber": 9718992,
    "cos:blockTimestamp": "2025-11-27T22:56:24Z",
    "cos:verified": true
  },
  "schema:publisher": {
    "@type": "schema:Organization",
    "schema:name": "NeoPlan Consult Pvt. Ltd."
  }
}
```

---

## 🌍 Impact & Scalability
- **Transparency:** Every compliance note is reproducible and verifiable.  
- **Ethics‑first design:** Built for accountability and sustainability.  
- **Scalability:** Modular SaaS certification workflows can extend globally across industries.  

---

## ✅ Judge Checklist
- [ ] Clone repo and install dependencies  
- [ ] Run `demo.js` → verify TxID on Sepolia  
- [ ] Run `demo_plain.js` → confirm SHA‑256 offline reproducibility  
- [ ] Check `audit_table.csv` and `screenshot5.png`  
- [ ] Review JSON‑LD structured example  
- [ ] Confirm reproducibility workflow matches documentation  

---

▶ Watch the full demo video in the [README Demo Video section](../readme.md).

---
