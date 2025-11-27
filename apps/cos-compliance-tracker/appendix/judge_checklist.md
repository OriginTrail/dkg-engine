# Judge Checklist — COS™ Blockchain Compliance Tracker

This checklist provides a reference for verifying the reproducibility and ethics‑first commitments of the COS™ Blockchain Compliance Tracker submission.

---

## ✅ Setup
The setup process involves cloning the repository, installing dependencies, and configuring environment variables.

1. Clone the repository:
   ```bash
   git clone https://github.com/cmacademyconsulting/COS-Blockchain-Compliance-Tracker.git
   cd COS-Blockchain-Compliance-Tracker
Install dependencies:

bash
npm install
Configure environment:

Copy .env.example to .env.

Add Infura Project ID and DKG Edge Node URL.

Ensure wallet keys are configured for Westend/Paseo testnets.

🚀 Demo Verification
The demo scripts illustrate how governance events are logged and verified.

Run demo script:

bash
npm run demo
Outputs governance events, SHA‑256 hashes, and blockchain Tx IDs.

Fallback demo (plain‑text):

bash
npm run demo:plain
Provides simplified outputs for universal compatibility.

Tx ID verification:

Open https://polkadot.js.org/apps (Westend/Paseo).

Paste a Tx ID from /appendix/audit_table.csv.

Block number and account can be checked against demo output.

📊 DKG Integration
These scripts demonstrate publishing and querying compliance notes in the OriginTrail DKG.

Publish compliance notes:

bash
node src/dkg_publish.js
Converts governance events into JSON‑LD/RDF Knowledge Assets with provenance metadata.

Query compliance notes:

bash
node src/mcp_query.js
MCP agents query published notes for ESG verification.

Compute reputation scores:

bash
node src/reputation_score.js
Oversight logs mapped into reputation scores, published to DKG for querying.

🎥 Demo Video
The demo video illustrates the flow: Governance event → Tx ID → DKG note → Reputation score → Dashboard view.

⚖️ Ethics‑First Commitments
See /docs/ethics_statement.md for transparency, accountability, and sustainability principles.

License: CC BY 4.0.

Reproducibility assets: /appendix/audit_table.csv, /appendix/screenshots/.

📘 References
COS™ Working Paper (Zenodo DOI): 10.5281/zenodo.17620309

Ethics Statement: /docs/ethics_statement.md

Roadmap: /docs/roadmap.md

Governance Framework: /docs/governance_framework.md

Challenge Alignment: /docs/challenge_alignment.md

---
