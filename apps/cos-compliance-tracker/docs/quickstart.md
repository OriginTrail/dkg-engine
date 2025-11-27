
## 🔹 Quickstart for Judges — COS™ Blockchain Compliance Tracker

### 1. Clone the Repository
```bash
git clone https://github.com/Constructionmgmtpractitioner/dkg-engine.git
cd dkg-engine/apps/cos-compliance-tracker
```

### 2. Install Dependencies
On Windows, run:
```bash
npm install --ignore-scripts
```
⚠️ This skips developer‑only scripts that may fail on Windows. Core dependencies still install correctly.

### 3. Configure Environment
Copy the example file:
```bash
copy .env.example .env
```
Edit `.env` with your own credentials:
```env
RPC_URL_SEPOLIA=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
```
- Get a free Infura Project ID from [infura.io](https://infura.io).  
- Use a funded Sepolia wallet private key (test ETH required).

### 4. Generate SHA‑256 Hashes
```bash
echo SafetyInspection: Worker safety inspection completed on site | sha256sum
echo QualityAudit: Independent quality audit completed | sha256sum
echo EnvironmentalCheck: Environmental compliance check passed | sha256sum
```

### 5. Run Demo Script
```bash
node demo.js "SafetyInspection: Worker safety inspection completed on site"
```
Outputs:
- Tx hash  
- Block number  
- Block timestamp  
- JSON compliance note  

### 6. Verify TxID
Paste the Tx hash into [Sepolia Etherscan](https://sepolia.etherscan.io) and confirm:
- Transaction mined  
- Block number matches  
- Timestamp matches  

### 7. Record Results
Update `/appendix/audit_table.csv` with:
- Event  
- Tx hash  
- Block number  
- Block timestamp  
- Verification status ✅  

### 8. Capture Screenshots
Save screenshots of:
- Terminal output  
- Sepolia Etherscan Tx page  
- JSON compliance note  

Store them in `/appendix/screenshots.md`.

### Offline Fallback Demo
If you don’t have Sepolia ETH or Infura credentials:
1. Run the fallback script:
   node demo_plain.js "SafetyInspection: Worker safety inspection completed on site"
2. This will output the event → hash mapping locally.
3. No blockchain transaction is submitted, but reproducibility is preserved.


---
