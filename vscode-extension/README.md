# SentryGate for VS Code

Adds a custom file icon and TOML syntax highlighting for `sentrygate.toml` configuration files.

## Features

- 🛡️ Custom SentryGate icon for `sentrygate.toml` files in the explorer
- Syntax highlighting (TOML grammar)
- Bracket matching, auto-closing pairs, and comment toggling

## Installation

### From VSIX (local)

```bash
cd vscode-extension
npm install -g @vscode/vsce
vsce package
code --install-extension sentrygate-1.0.0.vsix
```

### From Marketplace

Search for **SentryGate** in the VS Code Extensions panel.

## Requirements

VS Code 1.63 or later.
