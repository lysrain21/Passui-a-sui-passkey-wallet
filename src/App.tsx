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
    if (!recipient) {
      setAiMessage("Please enter a recipient address.");
      return false;
    }
    if (!recipient.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
      setAiMessage("Invalid recipient address format.");
      return false;
    }
    const formattedRecipient = recipient.startsWith("0x") ? recipient : `0x${recipient}`;
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
    setAiMessage("Creating transaction...");
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
      setAiMessage(`Transaction created. Click "Sign Transaction" to continue. Recipient: ${formattedRecipient}, Amount: ${amount} SUI.`);
      return true;
    } catch (error) {
      console.error("Failed to create transaction:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setAiMessage(`Failed to create transaction: ${errorMessage}`);
      return false;
    } finally {
      setCreateLoading(false);
    }
  }, [walletAddress, passkeyInstance, client, balance]);

  const handleChatCommand = async () => {
    if (!chatCommand.trim()) {
      setAiMessage("Please enter a command.");
      return;
    }

    setIsAiProcessing(true);
    setAiMessage("Parsing your command...");
    const command = chatCommand.toLowerCase().trim();

    if (command === "check balance" || command === "balance" || command === "show balance") {
      if (!walletAddress) {
        setAiMessage("Please create or load a wallet before checking the balance.");
      } else {
        await fetchBalance(true);
      }
    }
    else {
      const transferRegex = /(?:send|transfer)\s*([\d.]+)\s*(?:sui)\s*to\s*(.+)/i;
      const match = chatCommand.match(transferRegex);

      if (match) {
        if (!walletAddress || !passkeyInstance) {
          setAiMessage("Please create or load a wallet before making a transfer.");
          setIsAiProcessing(false);
          return;
        }
        const amountInput = match[1].trim();
        const recipientInput = match[2].trim();

        setTransferAmount(amountInput); // Pre-fill UI

        if (recipientInput.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
          const formattedRecipient = recipientInput.startsWith("0x") ? recipientInput : `0x${recipientInput}`;
          setRecipientAddress(formattedRecipient); // Pre-fill UI

          setAiMessage(`Preparing transaction: Send ${amountInput} SUI to ${formattedRecipient}...`);
          const createSuccess = await executeCreateTransaction(formattedRecipient, amountInput);

          if (createSuccess) {
            setAiMessage("Transaction created, requesting Passkey signature...");
            const signedSignature = await handleSignTransaction();

            if (signedSignature) {
              setAiMessage("Transaction signed successfully! Sending transaction automatically...");
              await handleSendTransaction(txBytes, signedSignature);
            }
          }
        } else {
          setRecipientAddress("");
          setAiMessage(`I understand you want to send ${amountInput} SUI to "${recipientInput}". Please enter the SUI address for "${recipientInput}" in the "Recipient Address" field on the "Send" page, then click "Create Transaction". The amount has been pre-filled for you.`);
          setActiveView("SEND");
        }
      } else {
        setAiMessage("I couldn't understand that command. You can try: \"check balance\" or \"send [amount] sui to [address]\".");
      }
    }
    setChatCommand("");
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
    if (!recipientAddress) {
      setAiMessage("Please enter a recipient address.");
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
                    placeholder="e.g., send 0.01 sui to 0x... or check balance"
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