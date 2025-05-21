# Sui Passkey AI Wallet Example

This project is an example application demonstrating the use of the Sui Passkey SDK to create and manage a wallet, send transactions on the Sui network, and interact with an AI assistant for common wallet operations. It's built with React, TypeScript, and Vite.

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
*   **AI Integration:** DeepSeek API (via `axios` for HTTP requests)

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
*   [`axios`](https://www.npmjs.com/package/axios): Used for making HTTP requests to the DeepSeek API.
*   [`react`](https://reactjs.org/): For building the user interface.
*   [`typescript`](https://www.typescriptlang.org/): For static typing.
*   [`vite`](https://vitejs.dev/): As the build tool and development server.

## SDK Documentation

For more detailed information on the Sui Passkey SDK and other Sui TypeScript SDK features, refer to the official [Sui SDK documentation](https://sdk.mystenlabs.com/typescript/cryptography/passkey).

## How It Works

The application initializes a `SuiClient` to connect to the Sui testnet. It uses the `BrowserPasskeyProvider` from `@mysten/sui/keypairs/passkey` to manage Passkey credentials.

*   **Wallet Creation/Loading:**
    *   `PasskeyKeypair.getPasskeyInstance()` is used to create a new Passkey and associate it with a new Sui address.
    *   `PasskeyKeypair.signAndRecover()` along with `findCommonPublicKey()` is used to recover an existing Passkey and its associated Sui address by prompting the user for two signatures.
*   **AI Assistant:**
    *   User input from the "Assistant" view is sent to the DeepSeek API via the `formatCommandWithAgent` function in [`src/App.tsx`](src/App.tsx).
    *   A system prompt guides the AI to format natural language into structured commands like `send [amount] sui to [recipient]` or `check balance`.
    *   The application then parses this formatted command to perform actions like fetching the balance or initiating a transaction flow.
*   **Transactions:**
    *   Transactions are built using the `Transaction` class from `@mysten/sui/transactions`.
    *   The `passkeyInstance.signTransaction()` method is used to sign the transaction using the device's Passkey.
    *   `client.executeTransactionBlock()` sends the signed transaction to the network.

This project serves as a practical example of integrating Passkey authentication with Sui blockchain operations, enhanced by an AI-driven command interface.