import type { SentryGateConfig } from "../core/types.core";
import { join } from "node:path";

export async function loadSentryConfig(): Promise<SentryGateConfig> {
    // Look for sentrygate.toml in the folder where the user executed the command
    const configPath = join(process.cwd(), "sentrygate.toml");
    const file = Bun.file(configPath);

    if (!(await file.exists())) {
        throw new Error(
            `🛡️ SentryGate: Configuration file not found at ${configPath}\n` +
            `Please ensure "sentrygate.toml" exists in your current directory.`
        );
    }

    try {
        const content = await file.text();
        return Bun.TOML.parse(content) as unknown as SentryGateConfig;
    } catch (err: any) {
        throw new Error(`🛡️ SentryGate: Failed to parse TOML: ${err.message}`);
    }
}

import config from './bunfig.toml'


