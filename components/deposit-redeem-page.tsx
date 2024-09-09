'use client'

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAccount, useChains, useSwitchChain, useConnect } from "wagmi"
import { parseEther, keccak256, parseAbi, isAddress, encodeAbiParameters, parseAbiParameters } from "viem"
import { useWriteContract } from 'wagmi';
import { BlindlyCashAddress } from "@/lib/const"
import BigInteger from "node-rsa/src/libs/jsbn";
// @ts-ignore
import { Key } from "node-rsa/src/libs/rsa"
import { formatBigIntegerToHexString } from "@/lib/utils"
import { randomBytes } from 'crypto';

// RSA Public Key
const n = Buffer.from('a709e2f84ac0e21eb0caa018cf7f697f774e96f8115fc2359e9cf60b1dd8d4048d974cdf8422bef6be3c162b04b916f7ea2133f0e3e4e0eee164859bd9c1e0ef0357c142f4f633b4add4aab86c8f8895cd33fbf4e024d9a3ad6be6267570b4a72d2c34354e0139e74ada665a16a2611490debb8e131a6cffc7ef25e74240803dd71a4fcd953c988111b0aa9bbc4c57024fc5e8c4462ad9049c7f1abed859c63455fa6d58b5cc34a3d3206ff74b9e96c336dbacf0cdd18ed0c66796ce00ab07f36b24cbe3342523fd8215a8e77f89e86a08db911f237459388dee642dae7cb2644a03e71ed5c6fa5077cf4090fafa556048b536b879a88f628698f0c7b420c4b7', 'hex')
const e = 65537

const rsa = new Key();
rsa.setPublic(n, e);
console.log("rsa:", rsa)

export function DepositRedeemPage() {

  const [walletConnectStatus, setWalletConnectStatus] = useState("")
  const [depositBtnExtraTxt, setDepositBtnExtraTxt] = useState("")
  const [redeemNote, setRedeemNote] = useState("")
  const [redeemTo, setRedeemTo] = useState("")
  const [depositMessage, setDepositMessage] = useState("")

  const [redeemFailInfo, setRedeemFailInfo] = useState("")
  const [redeemTxHash, setRedeemTxHash] = useState("")

  const { data: hash, isPending, writeContract } = useWriteContract()

  const { address, isConnected, chainId, chain } = useAccount()
  console.log("isConnected:", isConnected, address)
  const { switchChain } = useSwitchChain()

  console.log("chainId:", chainId)
  const supportedChains = useChains()
  const isSupportedChain = supportedChains.some(chain => chain.id === chainId)

  const { connect, connectors } = useConnect()

  // for wallet connect status
  useEffect(() => {
    if (isConnected) {
      if (isSupportedChain) {
        setWalletConnectStatus("connected " + `${address?.substring(0, 6)}` + `${chain && " " + chain?.name}`)
      } else {
        setWalletConnectStatus("must-switch-chain")
      }
    } else {
      setWalletConnectStatus("must-connect-wallet")
    }
  }, [isConnected, isSupportedChain, address, chain])

  useEffect(() => {
    setDepositBtnExtraTxt(walletConnectStatus)
  }, [walletConnectStatus])

  const isRedeemToValidAdx = isAddress(redeemTo)

  const handleDepositBtnClick = () => {
    setDepositMessage("")

    setRedeemNote("")
    setRedeemFailInfo("")
    setRedeemTxHash("")

    switch (walletConnectStatus) {
      case "must-connect-wallet":
        connect({ connector: connectors[0] })
        break
      case "must-switch-chain":
        switchChain({ chainId: supportedChains[0].id })
        break
      default:

        const buf = randomBytes(256);
        const originMsg = keccak256(buf)

        setDepositMessage(`redeem note: ${originMsg}`)
        setRedeemNote(originMsg)

        const msgHash = keccak256(originMsg)

        const rst = writeContract({
          address: BlindlyCashAddress,
          abi: parseAbi(['function deposit(bytes32 msgHash)']),
          functionName: 'deposit',
          args: [msgHash],
          value: parseEther("0.1") as any,
        })

        console.log("Deposit initiated", supportedChains, chainId, "rst:", rst)
        console.log("chainId:", chainId)
        console.log("rst:", rst)

        break
    }
  }

  const handleRedeem = () => {
    console.log(`Redeem initiated with note: ${redeemNote}`)

    // reset 
    setRedeemFailInfo("")
    setRedeemTxHash("")

    // encrypt triplet (bytes32 msgHash, address redeemTo, uint256 tipBP) using RSA
    const payload = encodeAbiParameters(parseAbiParameters('bytes32 msg,address redeemTo,uint256 tipBP'), [redeemNote as `0x${string}`, redeemTo as `0x${string}`, BigInt(10)])
    console.log("encoded payload triplet:", payload)
    const encrypted = rsa.$doPublic(new BigInteger(payload.substring(2), 16));
    const encryptedHex = "0x" + formatBigIntegerToHexString(encrypted)
    console.log("encrypted:", encryptedHex)

    // call /api/redeem?encryptedTriplet=xxx
    fetch(`/api/redeem?encryptedTriplet=${encryptedHex}`)
      .then(res => res.json())
      .then(data => {
        console.log("redeem result:", data)

        if (data.status === "fail") {
          let info = data.detail || data.status
          info += "(possible reasons: 1. invalid redeem note; 2. deposit tx for the redeem note not on chain yet; 3. used redeem note)"

          setRedeemFailInfo(info)
        } else if (data.txHash) {
          setRedeemTxHash(data.txHash)
        } else {
          setRedeemFailInfo("your redeem failed")
        }
      })
      .catch(err => {
        console.error("redeem error:", err)
        setRedeemFailInfo("fail")
      })
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Toliman coin mixer</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

        <Card className="w-full flex flex-col min-h-[300px]">
          <CardHeader>
            <CardTitle>Deposit</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col justify-center items-center">
            <p className="text-center text-muted-foreground mb-4">Click the button below to deposit 0.1E</p>

            <Button className="w-full" disabled={isPending} onClick={handleDepositBtnClick}>
              Deposit 0.1E {!!depositBtnExtraTxt && `(${depositBtnExtraTxt})`}
            </Button>

            {depositMessage && (
              <div className="w-full max-w-xs overflow-hidden">
                <p className={`text-center break-words text-green-600`}>
                  {depositMessage}
                </p>
              </div>
            )}

            {hash && (
              <p className={`mt-4 text-center`}>
                <a href={`https://explorer.toliman.suave.flashbots.net/tx/${hash}`} target="_blank" rel="noopener noreferrer">
                  tx: {hash.substring(0, 6)}...{hash.substring(hash.length - 4)}
                </a>
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="w-full flex flex-col min-h-[300px]">
          <CardHeader>
            <CardTitle>Redeem</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col">
            <form onSubmit={(e) => { e.preventDefault(); handleRedeem(); }} className="mb-4">
              <div className="grid w-full items-center gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="redeemNote">Redeem Note</Label>
                  <Input
                    id="redeemNote"
                    placeholder="content of the downloaded file when you deposit"
                    value={redeemNote}
                    onChange={(e) => setRedeemNote(e.target.value)}
                  />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="redeemNote">To</Label>
                  <Input
                    id="redeemTo"
                    placeholder="the address to redeem to"
                    value={redeemTo}
                    onChange={(e) => setRedeemTo(e.target.value)}
                  />
                </div>
              </div>
            </form>
            <Button className="w-full mb-4" onClick={handleRedeem} disabled={!redeemNote || !isRedeemToValidAdx}>Redeem</Button>

            {redeemFailInfo && (
              <p className="text-center text-red-600">
                {redeemFailInfo}
              </p>
            )}

            {redeemTxHash && (
              <p className={`mt-4 text-center`}>
                <a href={`https://explorer.toliman.suave.flashbots.net/tx/${redeemTxHash}?tab=internal`} target="_blank" rel="noopener noreferrer">
                  tx: {redeemTxHash.substring(0, 6)}...{redeemTxHash.substring(redeemTxHash.length - 4)}
                </a>
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div >
  )
}