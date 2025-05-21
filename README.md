# Sui Passkey AI Wallet: A Blueprint for Next-Gen DApp Interfaces

This project showcases a powerful paradigm for modern DApp front-end development. While implemented as a Sui Passkey AI Wallet, it serves as a comprehensive example of integrating seamless Passkey authentication, AI-driven user interaction, and core blockchain operations. The patterns demonstrated here are applicable to a wide range of decentralized applications, illustrating how to build intuitive and secure user experiences on the Sui network. It's built with React, TypeScript, and Vite.

## Features

*   **Passkey Wallet Management:**
    *   Create a new Passkey-secured wallet.
    *   Load an existing Passkey wallet.
*   **Sui Blockchain Interaction:**
    *   Fetch and display SUI balance.
    *   Request SUI from a testnet faucet.
    *   Create and sign transactions to send SUI.
    *   Execute transactions on the Sui testnet.
    *   Display transaction digests with links to SuiScan.
*   **AI Assistant (Powered by DeepSeek API):**
    *   Understand natural language commands for:
        *   Checking balance (e.g., "check my balance", "how much SUI do I have?").
        *   Sending SUI (e.g., "send 0.5 SUI to bob", "transfer 10 SUI to 0x123...abc").
    *   Automates transaction creation, signing, and sending based on AI-parsed commands.
*   **User Interface:**
    *   Clear views for wallet overview, sending SUI, and interacting with the AI assistant.
    *   Displays AI messages and transaction status updates.
    *   Address book for managing recipient aliases.

## Tech Stack

*   **Frontend:** React, TypeScript
*   **Build Tool:** Vite
*   **Sui Interaction:** [`@mysten/sui`](https://www.npmjs.com/package/@mysten/sui) (Sui TypeScript SDK)
*   **AI Integration:** DeepSeek API (via `fetch` API for HTTP requests)

## Getting Started

### Prerequisites

*   Node.js (version specified in `package.json` or higher)
*   pnpm (or npm/yarn)

### Installation and Running Locally

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd passui
    ```

2.  **Install dependencies:**
    ```bash
    pnpm install
    ```

3.  **Set up DeepSeek API Key:**
    Open `src/App.tsx` and replace the placeholder `DEEPSEEK_API_KEY` with your actual DeepSeek API key:
    ```typescript
    // filepath: src/App.tsx
    // ...existing code...
    // DeepSeek API Configuration
    const DEEPSEEK_API_KEY = "YOUR_DEEPSEEK_API_KEY_HERE"; // Replace with your API Key
    const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";
    // ...existing code...
    ```

4.  **Run the development server:**
    ```bash
    pnpm dev
    ```
    The application will typically be available at `http://localhost:5173` (or another port if 5173 is in use).

### Building for Production

```bash
pnpm build
```
This command will generate a `dist` folder with the production-ready static assets. You can preview the build using:
```bash
pnpm preview
```

## Key Dependencies

*   [`@mysten/sui`](https://www.npmjs.com/package/@mysten/sui): For all Sui blockchain interactions, including Passkey operations, client communication, transaction building, and faucet requests.
*   [`react`](https://reactjs.org/): For building the user interface.
*   [`typescript`](https://www.typescriptlang.org/): For static typing.
*   [`vite`](https://vitejs.dev/): As the build tool and development server.

## SDK Documentation

For more detailed information on the Sui Passkey SDK and other Sui TypeScript SDK features, refer to the official [Sui SDK documentation](https://sdk.mystenlabs.com/typescript/cryptography/passkey).

## How It Works

The application initializes a `SuiClient` to connect to the Sui testnet and uses the `BrowserPasskeyProvider` from `@mysten/sui/keypairs/passkey` to manage Passkey credentials. It demonstrates a typical workflow for AI-assisted DApp interactions:

*   **Wallet Creation/Loading:**
    *   `PasskeyKeypair.getPasskeyInstance()` is used to create a new Passkey and associate it with a new Sui address.
    *   `PasskeyKeypair.signAndRecover()` along with `findCommonPublicKey()` is used to recover an existing Passkey and its associated Sui address by prompting the user for two signatures.
*   **AI-Driven Interaction:**
    *   User's natural language commands are processed by an AI (DeepSeek API via the `formatCommandWithAgent` function in [`src/App.tsx`](src/App.tsx)).
    *   A system prompt guides the AI to translate these commands into structured, actionable DApp instructions (e.g., `send [amount] sui to [recipient]`, `check balance`).
    *   This showcases a user-friendly interface for complex blockchain actions, abstracting away the underlying technicalities.
*   **Transaction Lifecycle:**
    *   Based on the AI-parsed command or direct user input, the application follows a standard transaction lifecycle:
        *   **Construction:** Transactions are built using the `Transaction` class from `@mysten/sui/transactions`.
        *   **Signing:** The `passkeyInstance.signTransaction()` method leverages the device's Passkey for secure, user-friendly signing.
        *   **Execution:** `client.executeTransactionBlock()` sends the signed transaction to the Sui network.

This project not only serves as a practical example of integrating Passkey authentication with Sui blockchain operations but also as a blueprint for developing next-generation DApps with intuitive, AI-enhanced user interfaces on the Sui platform.