
# COS™ Blockchain Compliance Tracker

This module demonstrates transparent, standards‑aligned compliance tracking with reproducibility for hackathon judges.

---

## 🚀 Quickstart

Run a demo transaction on Sepolia:
```bash
node apps/cos-compliance-tracker/demo.js "SafetyInspection: Worker safety inspection completed on site"
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

Run the offline fallback demo:
```bash
node apps/cos-compliance-tracker/demo_plain.js "SafetyInspection: Worker safety inspection completed on site"
```

---

## ⚙️ Environment Setup

Copy `.env.example` → `.env` and add your credentials:
```env
RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```

- Get a free Infura Project ID from [infura.io](https://infura.io).  
- Use a funded Sepolia wallet private key (test ETH required).  

---

## 📂 Reproducibility Assets

- [commands.md](appendix/commands.md) — step‑by‑step workflow  
- [audit_table.csv](audit_table.csv) — reproducibility ledger  
- [screenshots.md](appendix/screenshots.md) — visual evidence  
- [judge_instructions.md](judge_instructions.md) — detailed guide for judges  
- [judge_checklist.md](appendix/judge_checklist.md) — quick verification checklist  

---

## 📖 Documentation

See `/docs` for methodology, governance framework, roadmap, impact, and references.

---

## 🎥 Demo Video

A short walkthrough video will be linked here before final submission.

---

## ✅ Judge Checklist

Judges can:
- Generate and verify SHA‑256 hashes locally  
- Run blockchain demo and confirm TxID on Sepolia  
- Run offline fallback demo without Sepolia ETH  
- Capture reproducibility screenshots  
- Confirm audit table entries  
- Watch the demo video (link to be added)  


---
