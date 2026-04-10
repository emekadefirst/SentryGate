import { loadSentryConfig } from "./utils/loader.utils";
import { SentryGate } from "./core/engine.core";

async function main() {
    try {
        const config = await loadSentryConfig();
        const gate = new SentryGate(config);
        
        gate.start();
    } catch (error: any) {
        console.error(error.message);
        process.exit(1);
    }
}

main();