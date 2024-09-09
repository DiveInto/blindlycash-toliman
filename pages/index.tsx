import { Inter } from "next/font/google";
import { DepositRedeemPage } from "@/components/deposit-redeem-page";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { config } from "../lib/config";

const inter = Inter({ subsets: ["latin"] });

const queryClient = new QueryClient()

export default function Home() {
  return (
    <main
      className={`flex min-h-screen flex-col items-center justify-between p-24 ${inter.className}`}
    >
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <DepositRedeemPage />
        </QueryClientProvider>
      </WagmiProvider>
    </main>
  );
}
