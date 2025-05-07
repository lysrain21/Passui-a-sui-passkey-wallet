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

  const fetchBalance = useCallback(async (showAiMessage = false) => {
    if (!walletAddress) return;
    if (showAiMessage) setAiMessage("正在查询余额...");
    try {
      const balanceData = await client.getBalance({
        owner: walletAddress,
      });
      const suiBalance = (parseInt(balanceData.totalBalance) / 1_000_000_000).toFixed(4);
      setBalance(balanceData.totalBalance);
      if (showAiMessage) setAiMessage(`您的当前余额为: ${suiBalance} SUI`);
    } catch (error) {
      console.error("获取余额失败:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`获取余额失败: ${errorMessage}`);
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
      setAiMessage("正在创建Passkey钱包...");
      const passkey = await PasskeyKeypair.getPasskeyInstance(passkeyProvider);
      const address = passkey.getPublicKey().toSuiAddress();
      setWalletAddress(address);
      setPasskeyInstance(passkey);
      setAiMessage(`钱包创建成功！地址: ${address}`);
      console.log("Wallet created with address:", address);
    } catch (error) {
      console.error("Error creating wallet:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`创建钱包失败: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const executeCreateTransaction = useCallback(async (recipient: string, amount: string) => {
    if (!walletAddress || !passkeyInstance) {
      setAiMessage("请先创建或加载钱包。");
      return false;
    }
    if (!recipient) {
      setAiMessage("请输入接收地址。");
      return false;
    }
    if (!recipient.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
      setAiMessage("接收地址格式不正确。");
      return false;
    }
    const formattedRecipient = recipient.startsWith("0x") ? recipient : `0x${recipient}`;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAiMessage("请输入有效的转账金额。");
      return false;
    }
    const amountInMist = BigInt(Math.floor(Number(amount) * 1_000_000_000));
    if (balance && BigInt(balance) < amountInMist) {
      setAiMessage("余额不足。");
      return false;
    }
    setCreateLoading(true);
    setAiMessage("正在创建交易...");
    try {
      const { data: coins } = await client.getCoins({
        owner: walletAddress,
        coinType: "0x2::sui::SUI",
      });
      if (!coins.length) {
        setAiMessage("钱包中没有SUI代币。请先领取测试币。");
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
      setAiMessage(`交易已创建。请点击“签名交易”以继续。收款人: ${formattedRecipient}, 金额: ${amount} SUI.`);
      return true;
    } catch (error) {
      console.error("创建交易失败:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`创建交易失败: ${errorMessage}`);
      return false;
    } finally {
      setCreateLoading(false);
    }
  }, [walletAddress, passkeyInstance, client, balance]);

  const handleChatCommand = async () => {
    if (!chatCommand.trim()) {
      setAiMessage("请输入指令。");
      return;
    }

    setIsAiProcessing(true);
    setAiMessage("正在解析您的指令...");
    const command = chatCommand.toLowerCase().trim();

    // Balance inquiry
    if (command === "查询余额" || command === "查余额" || command === "余额") {
      if (!walletAddress) {
        setAiMessage("请先创建或加载钱包后再查询余额。");
      } else {
        await fetchBalance(true); // Pass true to show AI message
      }
    }
    // Transfer command
    else {
      const transferRegex = /(?:给|向)\s*(.+?)\s*(?:转账|转)\s*([\d.]+)\s*(?:sui|个sui)/i;
      const match = chatCommand.match(transferRegex);

      if (match) {
        if (!walletAddress) {
          setAiMessage("请先创建或加载钱包后再执行转账操作。");
        } else {
          const recipientInput = match[1].trim();
          const amountInput = match[2].trim();

          setTransferAmount(amountInput);

          if (recipientInput.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
            const formattedRecipient = recipientInput.startsWith("0x") ? recipientInput : `0x${recipientInput}`;
            setRecipientAddress(formattedRecipient);
            const success = await executeCreateTransaction(formattedRecipient, amountInput);
            if (success) {
              // Message is set within executeCreateTransaction
            }
          } else {
            setRecipientAddress("");
            setAiMessage(`我识别到您想给“${recipientInput}”转账 ${amountInput} SUI。请在下方的“接收地址”输入框中输入“${recipientInput}”的SUI地址，然后点击“创建交易”。金额已为您预填。`);
          }
        }
      } else {
        setAiMessage("无法识别您的指令。您可以尝试：“查询余额”或“给 [地址] 转账 [金额] sui”。");
      }
    }
    setChatCommand("");
    setIsAiProcessing(false);
  };

  const handleSignTransaction = async () => {
    if (!passkeyInstance || !txBytes) {
      setAiMessage("没有可签名的交易。请先创建交易。");
      return;
    }
    setSignLoading(true);
    setAiMessage("请求Passkey签名...");
    try {
      const bytesToSign = fromBase64(txBytes);
      const sig = await passkeyInstance.signTransaction(bytesToSign);
      setSignature(sig.signature);
      setAiMessage("交易签名成功！现在可以发送交易了。");
    } catch (error) {
      console.error("签名失败:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`签名失败: ${errorMessage}`);
    } finally {
      setSignLoading(false);
    }
  };

  const handleSendTransaction = async () => {
    if (!walletAddress || !signature || !txBytes) {
      setAiMessage("没有已签名或已创建的交易可以发送。");
      return;
    }
    setSendLoading(true);
    setAiMessage("正在发送交易...");
    try {
      const result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature,
        options: { showEffects: true },
      });
      setTxDigest(result.digest);
      setAiMessage(`交易已发送！摘要: ${result.digest}. 您可以在SuiScan上查看详情。`);
      await fetchBalance();
    } catch (error) {
      console.error("发送交易失败:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`发送交易失败: ${errorMessage}`);
    } finally {
      setSendLoading(false);
    }
  };

  const manualCreateTransaction = async () => {
    if (!walletAddress || !passkeyInstance) {
      setAiMessage("请先创建或加载钱包。");
      return;
    }
    if (!recipientAddress) {
      setAiMessage("请输入接收地址。");
      return;
    }
    if (!transferAmount) {
      setAiMessage("请输入转账金额。");
      return;
    }
    await executeCreateTransaction(recipientAddress, transferAmount);
  };

  const requestFaucet = async () => {
    if (!walletAddress) {
      setAiMessage("请先创建或加载钱包才能请求测试币。");
      return;
    }
    setFaucetLoading(true);
    setAiMessage("正在请求测试币...");
    try {
      await requestSuiFromFaucetV0({
        host: getFaucetHost("testnet"),
        recipient: walletAddress,
      });
      setAiMessage("测试币请求已发送。余额稍后更新。");
      await fetchBalance();
    } catch (error) {
      console.error("请求测试币失败:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`请求测试币失败: ${errorMessage}`);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleLoadWallet = async () => {
    setWalletLoadLoading(true);
    setAiMessage("正在尝试加载Passkey钱包...");
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
      setAiMessage(`钱包加载成功！地址: ${address}`);
    } catch (error) {
      console.error("加载钱包失败:", error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      setAiMessage(`加载钱包失败: ${errorMessage}`);
    } finally {
      setWalletLoadLoading(false);
    }
  };

  return (
    <div className="App theme-dark-blue">
      <header className="app-header">
        <h1>Sui Passkey AI 助手钱包</h1>
      </header>

      <main className="app-main">
        {!walletAddress && (
          <section className="card wallet-setup-card">
            <h2>开始使用</h2>
            <p className="wallet-setup-hint">请先创建或加载您的 Passkey 钱包以启用 AI 助手和交易功能。</p>
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
                加载钱包 →
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
                还没有sui passkey 钱包，创建一个
              </p>
            </div>
          </section>
        )}

        {walletAddress && (
          <>
            <section className="card ai-interaction-card">
              <h2>AI 助手</h2>
              <div className="chat-input-container">
                <input
                  type="text"
                  placeholder="例如：给 0x... 转账 0.01 sui 或 查询余额"
                  value={chatCommand}
                  onChange={(e) => setChatCommand(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && !isAiProcessing && handleChatCommand()}
                  className="chat-input"
                  disabled={isAiProcessing}
                />
                <Button onClick={handleChatCommand} loading={isAiProcessing} disabled={isAiProcessing || !chatCommand.trim()} className="btn-themed btn-send-command">
                  发送指令
                </Button>
              </div>
              {aiMessage && (
                <div className="ai-message-display">
                  <p><strong>AI:</strong> {aiMessage}</p>
                </div>
              )}
            </section>

            <section className="card wallet-dashboard-card">
              <h2>钱包仪表盘</h2>
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">地址:</span>
                  <span className="info-value address-value">{walletAddress}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">余额:</span>
                  <span className="info-value">{balance ? (parseInt(balance) / 1_000_000_000).toFixed(4) : "0"} SUI</span>
                </div>
              </div>

              <Button
                onClick={() => fetchBalance(true)} // Button to explicitly query balance via AI
                disabled={faucetLoading} // Can reuse faucetLoading or add a new one if needed
                loading={faucetLoading}
                className="btn-themed btn-query-balance"
              >
                通过AI查询余额
              </Button>

              <Button
                onClick={requestFaucet}
                disabled={faucetLoading}
                loading={faucetLoading}
                className="btn-themed btn-faucet"
              >
                请求测试币
              </Button>

              <div className="manual-transfer-section">
                <h3>手动转账 / AI预填</h3>
                <div className="input-group">
                  <label htmlFor="recipientAddress">接收地址:</label>
                  <input
                    id="recipientAddress"
                    type="text"
                    placeholder="接收地址 (0x...)"
                    value={recipientAddress}
                    onChange={(e) => setRecipientAddress(e.target.value)}
                    className="input-field-themed"
                  />
                </div>
                <div className="input-group">
                  <label htmlFor="transferAmount">转账金额 (SUI):</label>
                  <input
                    id="transferAmount"
                    type="text"
                    placeholder="转账金额 (SUI)"
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
                  创建交易
                </Button>
                <Button
                  onClick={handleSignTransaction}
                  disabled={signLoading || !txBytes}
                  loading={signLoading}
                  className="btn-themed btn-tx-action btn-sign"
                >
                  签名交易
                </Button>
                <Button
                  onClick={handleSendTransaction}
                  disabled={sendLoading || !txBytes || !signature}
                  loading={sendLoading}
                  className="btn-themed btn-tx-action btn-send"
                >
                  发送交易
                </Button>
              </div>
            </section>

            {(txBytes || signature || txDigest) && (
              <section className="card transaction-details-card">
                <h3>交易详情</h3>
                {txBytes && (
                  <div className="tx-detail-item">
                    <h4>交易字节 (Base64):</h4>
                    <p className="bytes-display">{txBytes}</p>
                  </div>
                )}
                {signature && (
                  <div className="tx-detail-item">
                    <h4>签名:</h4>
                    <p className="bytes-display">{signature}</p>
                  </div>
                )}
                {txDigest && (
                  <div className="tx-detail-item">
                    <h4>交易摘要:</h4>
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
              </section>
            )}
          </>
        )}
      </main>
      <footer className="app-footer">
        <p>© Sui AI Passkey Wallet - 安全、智能的交易体验</p>
      </footer>
    </div>
  );
};

export default App;