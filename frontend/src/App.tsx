import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import LotteryInterface from './components/LotteryInterface';
import './App.css';

function App() {
  const { isConnected } = useAccount();

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎰 ZLottery</h1>
        <p>Decentralized Lottery with Full Homomorphic Encryption</p>
        <div className="connect-wallet">
          <ConnectButton />
        </div>
      </header>
      
      <main>
        {isConnected ? (
          <LotteryInterface />
        ) : (
          <div className="welcome">
            <h2>Welcome to ZLottery!</h2>
            <p>Connect your wallet to start playing the encrypted lottery</p>
            <ul>
              <li>🎫 Tickets cost only 0.0001 ETH</li>
              <li>🔢 Pick numbers from 11-99</li>
              <li>🔐 Your numbers are encrypted with FHE</li>
              <li>🏆 Win the entire prize pool!</li>
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
