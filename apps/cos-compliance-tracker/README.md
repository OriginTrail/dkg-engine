
# 🏆 Hackathon Submission: OriginTrail Scaling Trust in the Age of AI

**Event:** [OriginTrail Global Hackathon 2025](https://dorahacks.io/hackathon/origintrail-scaling-trust-ai/detail)  
**Track(s):** 📝 Decentralized Community Notes + 🗣️ Social Graph Reputation  
**Theme:** Ethics‑First Governance for AI and Infrastructure Projects  

---

## 🎥 Demo Video

Watch the 2-minute demo here:  
[![COS™ Demo Video](https://img.youtube.com/vi/8bb8-A9xRLc/0.jpg)](https://youtu.be/8bb8-A9xRLc)  

Direct link: https://youtu.be/8bb8-A9xRLc  

---

## ⚡ Quick Start (Judge Path)

```bash
git clone https://github.com/cmacademyconsulting/COS-Blockchain-Compliance-Tracker.git
cd COS-Blockchain-Compliance-Tracker
npm install
cp .env.example .env   # add Infura Project ID + PRIVATE_KEY
npm run demo -- SafetyInspection
```

👉 Expected output: Event · SHA‑256 Hash · TxID · Block · Timestamp  
Verify TxID on [Sepolia Etherscan](https://sepolia.etherscan.io/).

---

## 🔧 Project Overview

COS™ Blockchain Compliance Tracker embeds **ethics‑first governance** into AI and donor‑funded infrastructure projects.  
It transforms governance events into **immutable blockchain records** linked to transaction IDs, block numbers, and timestamps.  
These records are extended into **OriginTrail DKG Knowledge Assets**, enabling verifiable compliance, oversight, and sustainability metrics.

---

## ✨ Challenge Alignment

### 📝 Decentralized Community Notes
- **Ethics‑First Logging:** Every compliance and oversight event is recorded as a fact‑check triple (`Event → VerifiedBy → TxID`), ensuring transparency and accountability.  
- **Provenance & Trust:** Notes are published to the OriginTrail DKG in **JSON‑LD/RDF format with provenance**, guaranteeing that each ESG milestone is traceable to its source.  
- **Combating Misinformation:** By linking sustainability claims (e.g., safety inspections, carbon permits, gender inclusion reports) to **verifiable Tx IDs**, COS™ prevents false reporting and deepfakes, reinforcing ethical governance.  

### 🗣️ Social Graph Reputation
- **Accountability Scoring:** Oversight logs are mapped into **reputation scores** for auditors, contractors, and agencies, rewarding ethical performance and exposing negligence.  
- **Transparent Signals:** Scores are computed using **frequency of verified compliance events** and **ESG contributions**, ensuring fairness and openness.  
- **Community Impact:** Published to the DKG for querying, these scores power **trusted feeds and governance dashboards**, giving donors, managers, and communities real‑time visibility into ethical performance.  

---

## 🛠️ Technical Implementation

- **Blockchain Layer:** Sepolia testnet (Tx IDs verified via Etherscan).  
- **Knowledge Layer:** OriginTrail DKG Edge Node integration (Knowledge Assets published in JSON‑LD/RDF with provenance).  
- **Agent Layer:** MCP agents query compliance notes and ESG metrics.  
- **Trust Layer:** Reputation scores computed and exposed via DKG APIs.  
- **Fallback Demo:** Plain‑text script ensures reproducibility across judge environments.  

---

## ⚖️ Ethics‑First Commitment

- **Transparency:** Immutable blockchain records linked to DKG Knowledge Assets.  
- **Accountability:** Oversight logs mapped to verifiable Tx IDs.  
- **Sustainability:** ESG metrics aggregated into a Sustainability Index.  
- **Openness:** Licensed under CC BY 4.0, with reproducible demo scripts and Zenodo DOI.  

---

## 📂 Submission Package

- **GitHub Repo:** https://github.com/cmacademyconsulting/COS-Blockchain-Compliance-Tracker  
- **Demo Video:** https://youtu.be/8bb8-A9xRLc  
- **Working Paper (Zenodo DOI):** https://doi.org/10.5281/zenodo.17620309  

---

## 🧑‍⚖️ Judge Resources

To make verification simple and judge‑friendly, we provide two complementary resources:

- [Judge Instructions](./judge_instructions.md) — step‑by‑step reproducibility guide with exact commands, demo video, and ethics commitments.  
- [Judge Checklist](./judge_checklist.md) — one‑page tick‑box table for quick verification of TxIDs, DKG assets, and reproducibility proofs.  

👉 Judges can choose either the **detailed walkthrough** or the **quick checklist** depending on their time and preference.

### Judge Checklist
1. Clone repo & install dependencies  
2. Configure `.env` with Infura Project ID + PRIVATE_KEY  
3. Run demo for all five governance events  
4. Verify Tx IDs via Sepolia Etherscan  
5. Review `/appendix/audit_table.csv` for consolidated proof  
6. Watch demo video (2 min) showing governance event → Tx ID → DKG note → reputation score  

## 📂 Proofs
- `/appendix/audit_table.csv` — consolidated governance events (human‑readable table)  
- `/proofs/demo_run.json` — machine‑readable demo output for reproducibility  

---

## 📊 Impact

- **Donors:** Gain confidence in fund allocation through verifiable ESG notes and ethical assurance.  
- **Project Managers:** Streamline compliance oversight with transparent reputation scoring and accountability.  
- **Communities:** Assured ethical delivery of projects with sustainability indices backed by immutable records.  
- **AI Governance Researchers:** Access reproducible framework for embedding ethics into AI workflows.  
- **Judges:** Experience a fully reproducible demo with transparent click‑paths, ensuring credibility and ease of verification.  

---

## 🔑 Keywords

Governance · ESG · Blockchain · Compliance · Audit trail · Donor transparency · Ethics‑first · OriginTrail · Sepolia · DKG · MCP  

---

## 📘 References

- COS™ Working Paper (Zenodo DOI): [10.5281/zenodo.17620309](https://doi.org/10.5281/zenodo.17620309)  
- OriginTrail Global Hackathon 2025 Challenge Page: [Scaling Trust in the Age of AI](https://dorahacks.io/hackathon/origintrail-scaling-trust-ai/detail)  
- Supporting academic and governance references are listed in `/docs/references.bib`  

---

## 🆕 What’s New (Nov 2025)

- Added `/appendix/audit_table.csv` with consolidated proof of all five governance events  
- Included `/docs/ethics_statement.md` outlining governance principles  
- Published demo narration, slides, storyboard, and timing plan in `/docs/` for reproducibility  
- Linked 2‑minute demo video in Submission Package  
- Updated README with Judge Checklist for step‑by‑step verification
