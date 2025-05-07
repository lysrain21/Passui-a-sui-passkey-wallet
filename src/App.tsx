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
import React, { useEffect, useState } from "react";
import Button from "./Button";

const passkeySavedName = "Sui Passkey Example";
// if you want to test with a local browser, change it to "platform" should be better.
const authenticatorAttachment = "cross-platform"; // "platform"

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

  // 添加接收地址和转账金额的状态
  const [recipientAddress, setRecipientAddress] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  const [balance, setBalance] = useState<string | null>(null);
  // 修改为testnet
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });

  const passkeyProvider = new BrowserPasskeyProvider(passkeySavedName, {
    rpName: passkeySavedName,
    rpId: window.location.hostname,
    authenticatorSelection: {
      authenticatorAttachment,
    },
  } as BrowserPasswordProviderOptions);

  useEffect(() => {
    fetchBalance();
  }, [walletAddress]);

  const handleCreateWallet = async () => {
    try {
      setLoading(true);

      const passkey = await PasskeyKeypair.getPasskeyInstance(passkeyProvider);

      const address = passkey.getPublicKey().toSuiAddress();
      setWalletAddress(address);
      setPasskeyInstance(passkey);
      console.log("Wallet created with address:", address);
    } catch (error) {
      console.error("Error creating wallet:", error);
    } finally {
      setLoading(false);
    }
  };

  const createTransaction = async () => {
    if (!walletAddress || !passkeyInstance) return;

    // 验证接收地址和转账金额
    if (!recipientAddress) {
      alert("请输入接收地址");
      return;
    }

    // 验证接收地址格式
    if (!recipientAddress.match(/^(0x)?[0-9a-fA-F]{64}$/)) {
      alert("接收地址格式不正确");
      return;
    }

    // 确保接收地址以0x开头
    const formattedRecipient = recipientAddress.startsWith("0x")
      ? recipientAddress
      : `0x${recipientAddress}`;

    // 验证转账金额
    if (!transferAmount || isNaN(Number(transferAmount)) || Number(transferAmount) <= 0) {
      alert("请输入有效的转账金额");
      return;
    }

    // 转换为SUI的最小单位（1 SUI = 10^9 MIST）
    const amountInMist = BigInt(Math.floor(Number(transferAmount) * 1_000_000_000));

    // 检查余额是否足够
    if (balance && BigInt(balance) < amountInMist) {
      alert("余额不足");
      return;
    }

    setCreateLoading(true);
    try {
      // 获取钱包中的SUI代币
      const { data: coins } = await client.getCoins({
        owner: walletAddress,
        coinType: "0x2::sui::SUI",
      });

      if (!coins.length) {
        alert("钱包中没有SUI代币");
        setCreateLoading(false);
        return;
      }

      // 创建交易
      const tx = new Transaction();
      tx.setSender(walletAddress);
      tx.setGasPrice(1000);
      tx.setGasBudget(2000000);

      // 从钱包中分割出指定数量的代币并转账
      const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInMist)]);
      tx.transferObjects([coin], tx.pure.address(formattedRecipient));

      // 构建交易
      let bytes = await tx.build({
        client: client,
        sender: walletAddress // 显式指定发送者
      });

      const base64Bytes = toBase64(bytes);
      setTxBytes(base64Bytes);
      console.log("Transaction bytes created:", base64Bytes);

      // 清除之前的签名和交易结果
      setSignature("");
      setTxDigest(null);
    } catch (error) {
      console.error("创建交易失败:", error);
      alert(`创建交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setCreateLoading(false);
    }
  };

  const signTransaction = async () => {
    if (!passkeyInstance || !txBytes) return;
    setSignLoading(true);
    try {
      const bytes = fromBase64(txBytes);
      const sig = await passkeyInstance.signTransaction(bytes);
      setSignature(sig.signature);
    } catch (error) {
      console.error("签名失败:", error);
      alert(`签名失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSignLoading(false);
    }
  };

  const fetchBalance = async () => {
    if (!walletAddress) return;
    try {
      const balance = await client.getBalance({
        owner: walletAddress,
      });
      setBalance(balance.totalBalance);
    } catch (error) {
      console.error("获取余额失败:", error);
    }
  };

  const requestFaucet = async () => {
    if (!walletAddress) return;

    setFaucetLoading(true);
    try {
      // 修改为testnet
      await requestSuiFromFaucetV0({
        host: getFaucetHost("testnet"),
        recipient: walletAddress,
      });
      console.log("Faucet request sent");
      await fetchBalance();
    } catch (error) {
      console.error("请求测试币失败:", error);
      alert(`请求测试币失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setFaucetLoading(false);
    }
  };

  const handleLoadWallet = async () => {
    setWalletLoadLoading(true);
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
      setWalletAddress(keypair.getPublicKey().toSuiAddress());
    } catch (error) {
      console.error("加载钱包失败:", error);
      alert(`加载钱包失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setWalletLoadLoading(false);
    }
  };

  const sendTransaction = async () => {
    if (!walletAddress || !signature) return;

    setSendLoading(true);
    try {
      const result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signature,
        options: {
          showEffects: true,
        },
      });
      console.log(result);
      setTxDigest(result.digest);
      await fetchBalance();
    } catch (error) {
      console.error("发送交易失败:", error);
      alert(`发送交易失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setSendLoading(false);
    }
  };

  return (
    <div className="App">
      <h1>Passkey Wallet Example on Sui Testnet</h1>

      <div className="button-group">
        <Button
          onClick={handleCreateWallet}
          disabled={loading}
          loading={loading}
          className="wallet-button"
        >
          Create Passkey Wallet
        </Button>

        <Button
          onClick={handleLoadWallet}
          disabled={walletLoadLoading}
          loading={walletLoadLoading}
        >
          Load Passkey Wallet
        </Button>
      </div>

      {walletAddress && (
        <div className="wallet-info">
          <h2>Wallet Created!</h2>
          <p>Address: {walletAddress}</p>
          <p>Balance: {balance ? parseInt(balance) / 1000000000 : "0"} SUI</p>

          <Button
            onClick={requestFaucet}
            disabled={faucetLoading}
            loading={faucetLoading}
            className="faucet-button"
          >
            Request Testnet Tokens
          </Button>

          {/* 添加接收地址和转账金额的输入框 */}
          <div className="transfer-form" style={{ margin: "20px 0" }}>
            <h3>Transfer SUI</h3>
            <div style={{ marginBottom: "10px" }}>
              <input
                type="text"
                placeholder="接收地址 (0x...)"
                value={recipientAddress}
                onChange={(e) => setRecipientAddress(e.target.value)}
                style={{ width: "100%", padding: "8px", marginBottom: "10px" }}
              />
              <input
                type="text"
                placeholder="转账金额 (SUI)"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                style={{ width: "100%", padding: "8px" }}
              />
            </div>
          </div>

          <div className="button-group">
            <Button
              onClick={createTransaction}
              disabled={createLoading || !recipientAddress || !transferAmount}
              loading={createLoading}
              className="transaction-button"
            >
              Create Transaction
            </Button>

            <Button
              onClick={signTransaction}
              disabled={signLoading || !txBytes}
              loading={signLoading}
              className="sign-button"
            >
              Sign Transaction
            </Button>

            <Button
              onClick={sendTransaction}
              disabled={sendLoading || !txBytes || !signature}
              loading={sendLoading}
              className="send-button"
            >
              Send Transaction
            </Button>
          </div>

          {txBytes && (
            <div className="transaction-info">
              <h3>Transaction Bytes:</h3>
              <p className="bytes">{txBytes}</p>
            </div>
          )}

          {signature && (
            <div className="transaction-info">
              <h3>Signature:</h3>
              <p className="bytes">{signature}</p>
            </div>
          )}

          {txDigest && (
            <div className="transaction-info">
              <h3>Transaction Digest:</h3>
              <p className="bytes">
                <a
                  href={`https://suiscan.xyz/testnet/tx/${txDigest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {txDigest}
                </a>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default App;