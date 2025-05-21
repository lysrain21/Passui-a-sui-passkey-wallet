import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { getFaucetHost, requestSuiFromFaucetV0 } from "@mysten/sui/faucet";
import {
  BrowserPasskeyProvider,
  BrowserPasswordProviderOptions,
  findCommonPublicKey,
  PasskeyKeypair,
} from "@mysten/sui/keypairs/passkey";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";
import React, { useEffect, useState, useCallback } from "react";
import Button from "./Button";

const passkeySavedName = "Sui Passkey Example";
const authenticatorAttachment = "cross-platform";

type View = "OVERVIEW" | "SEND" | "ASSISTANT";

// DeepSeek API Configuration
const DEEPSEEK_API_KEY = "sk-c1874120a14a4340895003dc17e78e41"; // Your API Key
const DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions";

// TypeScript interfaces for DeepSeek API
interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
  name?: string;
  tool_calls?: any;
  tool_call_id?: string;
}

interface DeepSeekRequestBody {
  model: string;
  messages: DeepSeekMessage[];
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  logprobs?: boolean;
  max_tokens?: number;
  n?: number;
  presence_penalty?: number;
  response_format?: { type: "text" | "json_object" };
  seed?: number;
  stop?: string | string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_logprobs?: number;
  tools?: any[];
  tool_choice?: any;
  user?: string;
}

interface DeepSeekResponseChoice {
  index: number;
  message: DeepSeekMessage;
  finish_reason: string;
  logprobs?: any;
}

interface DeepSeekResponseUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface DeepSeekResponseBody {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: DeepSeekResponseChoice[];
  usage: DeepSeekResponseUsage;
  system_fingerprint?: string;
}

// Helper function to resolve recipient alias to address
const resolveRecipient = (input: string, addressBook: { [alias: string]: string }): string => {
  const lowerInput = input.toLowerCase();
  if (addressBook[lowerInput]) {
    return addressBook[lowerInput];
  }
  return input;
};

const App: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [txDigest, setTxDigest] = useState<string | null>(null);
  const [txBytes, setTxBytes] = useState<string>("");
  const [signature, setSignature] = useState<string>("");
  const [passkeyInstance, setPasskeyInstance] = useState<PasskeyKeypair | null>(
    null
  );
  const [sendLoading, setSendLoading] = useState(false);
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [signLoading, setSignLoading] = useState(false);
  const [walletLoadLoading, setWalletLoadLoading] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  const [addressBook, setAddressBook] = useState<{ [alias: string]: string }>({
    alice: "0xb88717ea113d28d7167adece61f8addd1c4086bb6cb2c0f845782190f42dc74f", // Example address, please replace with a valid address
    bob: "0x28b2cc6a90939a4d51a23e98199d0a0ef0ff982dae9b3beff80ea39828d06b76",   // Example address, please replace with a valid address
    // You can add more here or allow users to add dynamically
  });

  const passkeyProvider = new BrowserPasskeyProvider(passkeySavedName, {
    rpName: passkeySavedName,
    rpId: window.location.hostname,
    authenticatorSelection: {
      authenticatorAttachment,
    },
  } as BrowserPasswordProviderOptions);

  const [chatCommand, setChatCommand] = useState("");
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [activeView, setActiveView] = useState<View>("OVERVIEW");

  // AI Agent函数 - 将用户输入格式化为标准命令
  const formatCommandWithAgent = async (rawCommand: string): Promise<string> => {
    setAiMessage("AI assistant is understanding your command...");

    const systemPrompt = `You are an AI assistant for a SUI crypto wallet. Your task is to format user's natural language commands into a specific structured format.
If the user wants to check their balance, format the command as: 'check balance'.
If the user wants to send SUI, format the command as: 'send [amount] sui to [recipient_alias_or_address]'.
Ensure the amount is a number and the recipient is a valid alias or address.

Examples:
- User: 'send 0.5 sui to bob' -> Output: 'send 0.5 sui to bob'
- User: 'Check my balance' -> Output: 'check balance'
- User: 'Transfer 100 coins to Alice' -> Output: 'send 100 sui to alice'
- User: 'how much money do I have?' -> Output: 'check balance'
- User: 'pay 25 SUI to 0x123abc' -> Output: 'send 25 sui to 0x123abc'
- User: 'I want to send 0.005 SUI to Bob's address' -> Output: 'send 0.005 sui to bob'

Only output the formatted command. Do not add any other text, explanations, or markdown formatting.`;

    const requestBody: DeepSeekRequestBody = {
      model: "deepseek-chat",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: rawCommand },
      ],
      stream: false,
      temperature: 0.1, // Lower temperature for more deterministic command formatting
    };

    try {
      const response = await fetch(DEEPSEEK_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = { error: { message: response.statusText } };
        }
        console.error("DeepSeek API error:", errorData);
        const apiErrorMessage = errorData?.error?.message || response.statusText;
        setAiMessage(`AI assistant call failed: ${apiErrorMessage}. Will attempt to execute the original input directly.`);
        return rawCommand; // Fallback to raw command
      }

      const responseData: DeepSeekResponseBody = await response.json();

      if (responseData.choices && responseData.choices.length > 0 && responseData.choices[0].message) {
        const formattedCommand = responseData.choices[0].message.content.trim();
        // Basic validation if the command looks like one of the expected formats
        if (formattedCommand.toLowerCase().startsWith("send ") || formattedCommand.toLowerCase() === "check balance") {
          setAiMessage(`AI assistant has formatted the command as: "${formattedCommand}"`);
          return formattedCommand;
        } else {
          setAiMessage(`AI assistant returned an unexpected format: "${formattedCommand}". Will attempt to use the original input or simpler parsing.`);
          console.warn("DeepSeek unexpected format:", formattedCommand);
          // Fallback to simpler regex parsing if AI fails to format correctly
          const transferPatterns = [
            /(?:send|transfer|pay)\s*([\d.]+)\s*(?:sui)?\s*to\s*(\S+)/i,
          ];
          for (const pattern of transferPatterns) {
            const match = rawCommand.toLowerCase().match(pattern);
            if (match) {
              const amount = match[1];
              const recipient = match[2].replace(/的$/, "");
              return `send ${amount} sui to ${recipient}`;
            }
          }
          if (rawCommand.toLowerCase().includes("balance")) {
            return "check balance";
          }
          return rawCommand;
        }
      } else {
        setAiMessage("AI assistant failed to format the command, will attempt to execute the original input directly.");
        console.warn("DeepSeek no choices or message in response:", responseData);
        return rawCommand; // Fallback
      }
    } catch (error) {
      console.error("Error calling DeepSeek API:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown network/fetch error';
      setAiMessage(`Error calling AI assistant: ${errorMessage}. Will attempt to execute the original input directly.`);
      return rawCommand; // Fallback to raw command on network or other errors
    }
  };

  const fetchBalance = useCallback(async (showAiMessage = false) => {
    if (!walletAddress) return;
    if (showAiMessage) setAiMessage("Fetching your balance...");
    try {
      const balanceData = await client.getBalance({
        owner: walletAddress,
      });
      const suiBalance = (parseInt(balanceData.totalBalance) / 1_000_000_000).toFixed(4);
      setBalance(balanceData.totalBalance);
      if (showAiMessage) setAiMessage(`Your current balance is: ${suiBalance} SUI`);
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to fetch balance: ${errorMessage}`);
    }
  }, [walletAddress, client]);

  useEffect(() => {
    if (walletAddress) {
      fetchBalance(); // Initial fetch on wallet load, no AI message
    }
  }, [walletAddress, fetchBalance]);

  const handleCreateWallet = async () => {
    try {
      setLoading(true);
      setAiMessage("Creating your Passkey wallet...");
      const passkey = await PasskeyKeypair.getPasskeyInstance(passkeyProvider);
      const address = passkey.getPublicKey().toSuiAddress();
      setWalletAddress(address);
      setPasskeyInstance(passkey);
      setAiMessage(`Wallet created successfully! Address: ${address}`);
      setActiveView("OVERVIEW");
      console.log("Wallet created with address:", address);
    } catch (error) {
      console.error("Error creating wallet:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to create wallet: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const executeCreateTransaction = useCallback(async (recipient: string, amount: string) => {
    if (!walletAddress || !passkeyInstance) {
      setAiMessage("Please create or load a wallet first.");
      return false;
    }

    const resolvedRecipient = resolveRecipient(recipient, addressBook);

    if (!resolvedRecipient) {
      setAiMessage("Please enter a recipient address or alias.");
      return false;
    }
    if (!resolvedRecipient.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
      if (recipient.toLowerCase() !== resolvedRecipient.toLowerCase()) { // Alias was used but resolved to invalid
        setAiMessage(`The alias "${recipient}" resolves to an invalid SUI address: "${resolvedRecipient}". Please check your address book or enter a valid 0x address.`);
      } else { // Input was not an alias and is invalid
        setAiMessage("Invalid recipient address format. Please enter a valid 0x address or a known alias.");
      }
      return false;
    }
    const formattedRecipient = resolvedRecipient.startsWith("0x") ? resolvedRecipient : `0x${resolvedRecipient}`;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAiMessage("Please enter a valid transfer amount.");
      return false;
    }
    const amountInMist = BigInt(Math.floor(Number(amount) * 1_000_000_000));
    if (balance && BigInt(balance) < amountInMist) {
      setAiMessage("Insufficient balance.");
      return false;
    }
    setCreateLoading(true);
    const recipientDisplay = recipient.toLowerCase() !== formattedRecipient.toLowerCase() ? `${recipient} (${formattedRecipient})` : formattedRecipient;
    setAiMessage(`Creating transaction to ${recipientDisplay} for ${amount} SUI...`);
    try {
      const { data: coins } = await client.getCoins({
        owner: walletAddress,
        coinType: "0x2::sui::SUI",
      });
      if (!coins.length) {
        setAiMessage("No SUI tokens in your wallet. Please request test SUI first.");
        setCreateLoading(false);
        return false;
      }
      const tx = new Transaction();
      tx.setSender(walletAddress);
      tx.setGasPrice(1000);
      tx.setGasBudget(2000000);
      const [coinToTransfer] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
      tx.transferObjects([coinToTransfer], tx.pure.address(formattedRecipient));
      let builtTxBytes = await tx.build({ client, sender: walletAddress });
      const base64Bytes = toBase64(builtTxBytes);
      setTxBytes(base64Bytes);
      setSignature("");
      setTxDigest(null);
      setAiMessage(`Transaction created. Click "Sign Transaction" to continue. Recipient: ${recipientDisplay}, Amount: ${amount} SUI.`);
      return true;
    } catch (error) {
      console.error("Failed to create transaction:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to create transaction: ${errorMessage}`);
      return false;
    } finally {
      setCreateLoading(false);
    }
  }, [walletAddress, passkeyInstance, client, balance, addressBook]);

  const handleChatCommand = async () => {
    if (!chatCommand.trim()) {
      setAiMessage("Please enter a command.");
      return;
    }

    setIsAiProcessing(true);
    setAiMessage("Processing your command..."); // Initial message

    // 调用AI Agent格式化指令
    const formattedCommandFromAgent = await formatCommandWithAgent(chatCommand);

    // AI Agent函数内部会更新aiMessage，这里使用它格式化后的命令
    const commandToProcess = formattedCommandFromAgent.toLowerCase().trim();

    if (commandToProcess === "check balance" || commandToProcess === "balance" || commandToProcess === "show balance") {
      if (!walletAddress) {
        setAiMessage("Please create or load a wallet first, then check the balance.");
      } else {
        await fetchBalance(true); // fetchBalance会设置自己的AI消息
      }
    }
    else {
      // 用于匹配 "send [amount] sui to [address or alias]" 的正则表达式
      // 如果AI Agent完美格式化，这个正则会匹配成功
      const transferRegex = /(?:send|transfer)\s*([\d.]+)\s*(?:sui)?\s*to\s*(.+)/i;
      const match = commandToProcess.match(transferRegex);

      if (match) {
        if (!walletAddress || !passkeyInstance) {
          setAiMessage("Please create or load a wallet first, then proceed with the transfer.");
          setIsAiProcessing(false);
          setChatCommand("");
          return;
        }
        const amountInput = match[1].trim();
        const recipientInput = match[2].trim();

        // AI 助手已解析指令，现在开始自动执行流程
        setAiMessage(`AI understands your command as: Send ${amountInput} SUI to ${recipientInput}. Preparing transaction...`);

        const resolvedRecipientAddress = resolveRecipient(recipientInput, addressBook);
        const recipientDisplay = recipientInput.toLowerCase() !== resolvedRecipientAddress.toLowerCase()
          ? `${recipientInput} (${resolvedRecipientAddress})`
          : resolvedRecipientAddress;

        if (!resolvedRecipientAddress.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
          setAiMessage(`The recipient "${recipientInput}" parsed by AI is not a valid SUI address or known alias. Please correct and try again, or operate manually on the 'Send' page.`);
          setTransferAmount(amountInput); // 预填写UI
          setRecipientAddress(recipientInput); // 用原始输入预填写，让用户修正
          setActiveView("SEND");
          setIsAiProcessing(false);
          setChatCommand("");
          return;
        }

        // 1. 创建交易
        // executeCreateTransaction will set its own aiMessage
        const createSuccess = await executeCreateTransaction(resolvedRecipientAddress, amountInput);

        if (createSuccess && txBytes) { // txBytes 应该在 executeCreateTransaction 成功后被设置
          // 2. 签名交易
          // handleSignTransaction will set its own aiMessage
          const signedSignature = await handleSignTransaction();

          if (signedSignature) {
            // 3. 发送交易
            // handleSendTransaction will set its own aiMessage
            await handleSendTransaction(txBytes, signedSignature);
          } else {
            // If signing fails or is canceled, aiMessage has already been set by handleSignTransaction
            // A more explicit message might be needed to indicate the process has stopped.
            setAiMessage(aiMessage || "Transaction signing was canceled or failed, process stopped.");
          }
        } else {
          // If transaction creation fails, aiMessage has already been set by executeCreateTransaction
          // A more explicit message might be needed to indicate the process has stopped.
          setAiMessage(aiMessage || "Transaction creation failed, process stopped.");
        }
      } else {
        // 如果AI Agent格式化了，但仍然不匹配已知命令
        setAiMessage(`AI assistant processed your command as: "${formattedCommandFromAgent}", but I couldn't fully understand it. You can try: "check balance" or "send [amount] sui to [address or alias]"`);
      }
    }
    setChatCommand(""); // 处理后清空输入
    setIsAiProcessing(false);
  };

  const handleSignTransaction = async (): Promise<string | null> => {
    if (!passkeyInstance || !txBytes) {
      setAiMessage("No transaction to sign. Please create a transaction first.");
      return null;
    }
    setSignLoading(true);
    setAiMessage("Requesting Passkey signature...");
    try {
      const bytesToSign = fromBase64(txBytes);
      const sig = await passkeyInstance.signTransaction(bytesToSign);
      setSignature(sig.signature);
      setAiMessage("Transaction signed successfully! You can now send the transaction.");
      return sig.signature;
    } catch (error) {
      console.error("Signing failed:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Signing failed: ${errorMessage}`);
      return null;
    } finally {
      setSignLoading(false);
    }
  };

  const handleSendTransaction = async (transactionBlockToSend: string, signatureToSend: string) => {
    if (!walletAddress || !signatureToSend || !transactionBlockToSend) {
      setAiMessage("No signed or created transaction to send.");
      return;
    }
    setSendLoading(true);
    setAiMessage("Sending transaction...");
    try {
      const result = await client.executeTransactionBlock({
        transactionBlock: transactionBlockToSend,
        signature: signatureToSend,
        options: { showEffects: true },
      });
      setTxDigest(result.digest);
      setAiMessage(`Transaction sent! Digest: ${result.digest}. You can view details on SuiScan.`);
      await fetchBalance();
    } catch (error) {
      console.error("Failed to send transaction:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to send transaction: ${errorMessage}`);
    } finally {
      setSendLoading(false);
    }
  };

  const manualCreateTransaction = async () => {
    if (!walletAddress || !passkeyInstance) {
      setAiMessage("Please create or load a wallet first.");
      return;
    }
    // recipientAddress will be used here, which could be an alias or an address
    // executeCreateTransaction will handle the resolution
    if (!recipientAddress) {
      setAiMessage("Please enter a recipient address or alias.");
      return;
    }
    if (!transferAmount) {
      setAiMessage("Please enter a transfer amount.");
      return;
    }
    await executeCreateTransaction(recipientAddress, transferAmount);
  };

  const requestFaucet = async () => {
    if (!walletAddress) {
      setAiMessage("Please create or load a wallet before requesting test SUI.");
      return;
    }
    setFaucetLoading(true);
    setAiMessage("Requesting test SUI...");
    try {
      await requestSuiFromFaucetV0({
        host: getFaucetHost("testnet"),
        recipient: walletAddress,
      });
      setAiMessage("Test SUI request sent. Your balance will update shortly.");
      await fetchBalance();
    } catch (error) {
      console.error("Failed to request test SUI:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to request test SUI: ${errorMessage}`);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleLoadWallet = async () => {
    setWalletLoadLoading(true);
    setAiMessage("Attempting to load your Passkey wallet...");
    try {
      const testMessage = new TextEncoder().encode("Hello world!");
      const possiblePks = await PasskeyKeypair.signAndRecover(
        passkeyProvider,
        testMessage
      );
      const testMessage2 = new TextEncoder().encode("Hello world 2!");
      const possiblePks2 = await PasskeyKeypair.signAndRecover(
        passkeyProvider,
        testMessage2
      );
      const commonPk = findCommonPublicKey(possiblePks, possiblePks2);
      const keypair = new PasskeyKeypair(commonPk.toRawBytes(), passkeyProvider);
      setPasskeyInstance(keypair);
      const address = keypair.getPublicKey().toSuiAddress();
      setWalletAddress(address);
      setAiMessage(`Wallet loaded successfully! Address: ${address}`);
      setActiveView("OVERVIEW");
    } catch (error) {
      console.error("Failed to load wallet:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to load wallet: ${errorMessage}`);
    } finally {
      setWalletLoadLoading(false);
    }
  };

  return (
    <div className="App theme-dark-blue">
      <header className="app-header">
        <h1>Sui Passkey AI Wallet</h1>
      </header>

      <main className="app-main">
        {!walletAddress ? (
          <section className="card wallet-setup-card">
            <h2>Get Started</h2>
            <p className="wallet-setup-hint">Please create or load your Passkey wallet to enable the AI Assistant and transaction features.</p>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
              marginTop: '1.5rem'
            }}>
              <Button
                onClick={handleLoadWallet}
                disabled={walletLoadLoading || loading}
                loading={walletLoadLoading}
                className="btn-themed btn-wallet-action"
                style={{
                  backgroundColor: 'white',
                  color: 'var(--primary-dark)',
                  fontWeight: 500,
                  padding: '0.9rem 1.8rem',
                  minWidth: '220px',
                }}
              >
                Load Wallet →
              </Button>
              <p
                onClick={(!loading && !walletLoadLoading) ? handleCreateWallet : undefined}
                style={{
                  cursor: (loading || walletLoadLoading) ? 'not-allowed' : 'pointer',
                  color: (loading || walletLoadLoading) ? 'var(--text-secondary)' : 'var(--secondary-blue)',
                  textDecoration: 'none',
                  fontSize: '1rem',
                  margin: 0,
                  opacity: (loading || walletLoadLoading) ? 0.6 : 1,
                }}
              >
                Don't have a Sui Passkey wallet? Create one
              </p>
            </div>
          </section>
        ) : (
          <>
            {/* Navigation Bar */}
            <nav className="app-navigation button-group" style={{ marginBottom: '2rem', justifyContent: 'center' }}>
              <Button onClick={() => setActiveView("OVERVIEW")} className={`btn-themed ${activeView === "OVERVIEW" ? "btn-active" : ""}`}>Overview</Button>
              <Button onClick={() => setActiveView("SEND")} className={`btn-themed ${activeView === "SEND" ? "btn-active" : ""}`}>Send</Button>
              <Button onClick={() => setActiveView("ASSISTANT")} className={`btn-themed ${activeView === "ASSISTANT" ? "btn-active" : ""}`}>Assistant</Button>
            </nav>

            {/* Global AI Message Display */}
            {aiMessage && (
              <div className="ai-message-display" style={{ marginBottom: '2rem', textAlign: 'center' }}>
                <p><strong>Assistant:</strong> {aiMessage}</p>
              </div>
            )}

            {/* Overview View */}
            {activeView === "OVERVIEW" && (
              <section className="card wallet-dashboard-card">
                <h2>Wallet Overview</h2>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-label">Address:</span>
                    <span className="info-value address-value">{walletAddress}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Balance:</span>
                    <span className="info-value">{balance ? (parseInt(balance) / 1_000_000_000).toFixed(4) : "0"} SUI</span>
                  </div>
                </div>
                <div className="button-group" style={{ marginTop: '1rem' }}>
                  <Button
                    onClick={() => fetchBalance(true)}
                    disabled={faucetLoading} // Should probably be a generic loading state or specific to fetchBalance
                    loading={faucetLoading} // Same as above
                    className="btn-themed btn-query-balance"
                  >
                    Check Balance
                  </Button>
                  <Button
                    onClick={requestFaucet}
                    disabled={faucetLoading}
                    loading={faucetLoading}
                    className="btn-themed btn-faucet"
                  >
                    Request Test SUI
                  </Button>
                </div>
              </section>
            )}

            {/* Send View */}
            {activeView === "SEND" && (
              <section className="card transfer-operations-card">
                <h2>Send SUI</h2>
                <div className="manual-transfer-section">
                  <h3>Execute Transfer</h3>
                  <div className="input-group">
                    <label htmlFor="recipientAddress">Recipient Address:</label>
                    <input
                      id="recipientAddress"
                      type="text"
                      placeholder="Recipient Address (0x...)"
                      value={recipientAddress}
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      className="input-field-themed"
                    />
                  </div>
                  <div className="input-group">
                    <label htmlFor="transferAmount">Amount (SUI):</label>
                    <input
                      id="transferAmount"
                      type="text"
                      placeholder="Amount (SUI)"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="input-field-themed"
                    />
                  </div>
                </div>

                <div className="button-group transaction-actions">
                  <Button
                    onClick={manualCreateTransaction}
                    disabled={createLoading || !recipientAddress || !transferAmount}
                    loading={createLoading}
                    className="btn-themed btn-tx-action"
                  >
                    Create Transaction
                  </Button>
                  <Button
                    onClick={async () => {
                      if (txBytes) {
                        const signedSignature = await handleSignTransaction();
                        if (signedSignature) {
                          // Optional: Add an AI message here if needed
                        }
                      }
                    }}
                    disabled={signLoading || !txBytes}
                    loading={signLoading}
                    className="btn-themed btn-tx-action btn-sign"
                  >
                    Sign Transaction
                  </Button>
                  <Button
                    onClick={() => handleSendTransaction(txBytes, signature)}
                    disabled={sendLoading || !txBytes || !signature}
                    loading={sendLoading}
                    className="btn-themed btn-tx-action btn-send"
                  >
                    Send Transaction
                  </Button>
                </div>

                {(txBytes || signature || txDigest) && (
                  <div className="transaction-details-card" style={{ marginTop: '2rem' }}>
                    <h3>Transaction Details</h3>
                    {txBytes && (
                      <div className="tx-detail-item">
                        <h4>Transaction Bytes (Base64):</h4>
                        <p className="bytes-display">{txBytes}</p>
                      </div>
                    )}
                    {signature && (
                      <div className="tx-detail-item">
                        <h4>Signature:</h4>
                        <p className="bytes-display">{signature}</p>
                      </div>
                    )}
                    {txDigest && (
                      <div className="tx-detail-item">
                        <h4>Transaction Digest:</h4>
                        <p className="bytes-display">
                          <a
                            href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-themed"
                          >
                            {txDigest}
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* AI Assistant View */}
            {activeView === "ASSISTANT" && (
              <section className="card ai-interaction-card">
                <h2>AI Assistant</h2>
                <div className="chat-input-container">
                  <input
                    type="text"
                    placeholder="e.g., send 0.01 SUI to Bob, or check my balance"
                    value={chatCommand}
                    onChange={(e) => setChatCommand(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && !isAiProcessing && handleChatCommand()}
                    className="chat-input"
                    disabled={isAiProcessing}
                  />
                  <Button onClick={handleChatCommand} loading={isAiProcessing} disabled={isAiProcessing || !chatCommand.trim()} className="btn-themed btn-send-command">
                    Send Command
                  </Button>
                </div>
                {/* AI messages are now displayed globally, but you could have chat history here */}
              </section>
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <p>© Sui AI Passkey Wallet - Secure, intelligent transactions</p>
      </footer>
    </div>
  );
};

export default App;