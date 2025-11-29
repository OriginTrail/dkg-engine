/* eslint-disable no-console */
import crypto from 'crypto';

async function runDemo() {
    try {
        const eventArg =
            process.argv[2] || 'SafetyInspection: Worker safety inspection completed on site';
        const message = eventArg;

        // Compute SHA-256 hash (matches reproducibility workflow)
        const hash = crypto.createHash('sha256').update(message).digest('hex');

        // Compliance note (local-only, no blockchain transaction)
        const complianceNote = {
            event: message,
            hash, // ✅ shorthand property
            verified: false,
            note: 'Local-only demo: no transaction submitted',
        };

        console.log(JSON.stringify(complianceNote, null, 2));
        console.log('✅ Demo complete (local-only).');
    } catch (err) {
        console.error('❌ Demo failed:', err);
    }
}

runDemo();
