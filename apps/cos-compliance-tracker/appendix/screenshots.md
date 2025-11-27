

# 📸 Screenshots — COS™ Blockchain Compliance Tracker

This file serves as the **index of reproducibility screenshots** for hackathon judges.  
Each screenshot provides visual evidence of the reproducibility workflow and must match outputs from demo scripts, Etherscan verification, and audit table entries.

All screenshots are stored in:
```
apps/cos-compliance-tracker/appendix/screenshots/
```

---

## 1. Local Hash Generation
![Terminal output showing SHA-256 hash](screenshots/screenshot1.png)

---

## 2. Blockchain Demo Transaction
![Terminal output showing compliance note JSON](screenshots/screenshot2.png)

---

## 3. Sepolia Etherscan Verification
![Browser window showing TxID details](screenshots/screenshot3.png)

---

## 4. Offline Fallback Demo
![Terminal output showing local-only compliance note](screenshots/screenshot4.png)

---

## 5. Audit Table Entry
![CSV file showing reproducibility record](screenshots/screenshot5.png)

---

## ✅ Judge Reminder
Judges should confirm that:
- Local hash matches the `hash` field in demo outputs  
- TxID and block details match Sepolia Etherscan verification  
- Offline fallback demo shows reproducibility without blockchain submission  
- Audit table entry corresponds to the verified transaction  
- Screenshots are consistent with `commands.md` and `judge_checklist.md`


---

