# Commands & Workflow Checklist — COS™ Blockchain Compliance Tracker

This document outlines the reproducibility workflow for generating SHA‑256 hashes, submitting demo transactions, verifying Tx IDs, and capturing screenshots. Judges and researchers can follow these steps to replicate the process.

---

## 1. Generate SHA‑256 Hashes (Local Terminal)
For each governance event, run:

```bash
echo "SafetyInspection: Worker safety inspection completed on site" | sha256sum
