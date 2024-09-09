import BlindlyCash from "../../abi/BlindlyCash.json";

// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import type { NextApiRequest, NextApiResponse } from "next";
import {
    http,
    decodeEventLog,
    encodeFunctionData,
    type Hex,
    keccak256
} from '@flashbots/suave-viem';
import {
    getSuaveProvider,
    getSuaveWallet,
    type TransactionRequestSuave
} from '@flashbots/suave-viem/chains/utils';
import { BlindlyCashAddress, ChainIdToliman, KettleAddressToliman, SUAVE_RPC_URL } from "@/lib/const";

const suaveProvider = getSuaveProvider(http(SUAVE_RPC_URL));

const PRIVATE_KEY: Hex = process.env.PRIVATE_KEY as Hex;
if (!PRIVATE_KEY || PRIVATE_KEY.length <= 0) {
    throw new Error("env PRIVATE_KEY is not set");
}

const wallet = getSuaveWallet({
    transport: http(SUAVE_RPC_URL),
    privateKey: PRIVATE_KEY,
});

type RedeemStatus = {
    txHash: string;
    status: string;
    detail?: string;
};

const inMemoryRequestMap = new Map<string, RedeemStatus>();

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse<RedeemStatus>,
) {
    const encryptedTriplet = req.query.encryptedTriplet
    if (!encryptedTriplet) {
        res.status(400).json({ status: "error", txHash: "", detail: "encryptedTriplet is required" })
        return
    }

    const hashOfEncryptedTriplet = keccak256(encryptedTriplet as `0x${string}`)
    inMemoryRequestMap.set(hashOfEncryptedTriplet, { status: "processing", txHash: "" })

    suaveProvider.watchPendingTransactions({
        async onTransactions(transactions) {
            for (const hash of transactions) {
                try {
                    const receipt = await suaveProvider.getTransactionReceipt({ hash });
                    console.log('Transaction Receipt:', receipt);
                    if (receipt.status === 'success' && receipt.logs.length > 0) {
                        const decodedLogs = decodeEventLog({
                            abi: BlindlyCash.abi,
                            ...receipt.logs[0],
                        })
                        console.log("decoded logs", decodedLogs)
                    }
                } catch (error) {
                    console.error('Error fetching receipt:', error);
                }
            }
        },
    });

    const gasPrice = await suaveProvider.getGasPrice();

    const calldata = encodeFunctionData({
        abi: BlindlyCash.abi,
        functionName: "offchainRedeem",
        args: [
            encryptedTriplet,
            BigInt(10),
        ]
    })
    console.log("calldata:", calldata)

    const ccr: TransactionRequestSuave = {
        chainId: ChainIdToliman,
        to: BlindlyCashAddress,
        gasPrice,
        gas: BigInt(5690000),
        type: '0x43',
        data: calldata,
        isEIP712: true,
        kettleAddress: KettleAddressToliman,
    };

    try {
        const txHash = await wallet.sendTransaction(ccr);
        inMemoryRequestMap.set(hashOfEncryptedTriplet, { status: "sent", txHash: txHash })
        res.status(200).json({ status: "sent", txHash: txHash });
    } catch (error: any) {
        console.error('Error sending transaction:', error, "-1-------", error?.cause, "-2--", error?.details, "-3---", error?.message);
        res.status(200).json({ status: "fail", txHash: "", detail: error?.details });
    }
}