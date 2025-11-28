
# 📄 JSON‑LD Examples — COS™ Blockchain Compliance Tracker

This appendix provides structured JSON‑LD examples of compliance notes.  
Judges can copy/paste these snippets to verify agent behavior, interoperability, and reproducibility.

---

## 🛡️ Safety Inspection

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

## 🌱 Carbon Permit

```json
{
  "@context": {
    "schema": "http://schema.org/",
    "cos": "https://neoplan.consult/schema/cos#"
  },
  "@id": "cos:CarbonPermit2025-11-27",
  "@type": "cos:ComplianceNote",
  "schema:name": "CarbonPermit: Carbon emissions permit issued",
  "schema:identifier": "0c00031ad51ca4e4e78de1b3312e4803f34a07468be3ae755a62436abfdeee51",
  "cos:evidence": {
    "cos:txid": "0x0297f64d9079cb0768a76ee949baa77484eced86217c07db5f297d60f5e4e4fc",
    "cos:blockNumber": 9719008,
    "cos:blockTimestamp": "2025-11-27T23:06:28Z",
    "cos:verified": true
  },
  "schema:publisher": {
    "@type": "schema:Organization",
    "schema:name": "NeoPlan Consult Pvt. Ltd."
  }
}
```

---

## 📌 Usage Notes
- Each JSON‑LD snippet corresponds to a governance event logged in `audit_table.csv`.  
- Judges can verify:
  - **SHA‑256 hash** → matches `schema:identifier`  
  - **TxID** → verifiable on Sepolia Etherscan  
  - **Block number & timestamp** → confirm blockchain evidence  
- These examples demonstrate **agent behavior** (publishing, querying, verifying) in the DKG.

---

**End of JSON‑LD Examples**

---
