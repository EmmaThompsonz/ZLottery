import { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';

const TICKET_PRICE = '0.0001';
const MIN_NUMBER = 11;
const MAX_NUMBER = 99;

export function TicketPurchase() {
  const { address } = useAccount();
  const [ticketNumber, setTicketNumber] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const { instance, isInitialized } = useZamaInstance();
  const signer = useEthersSigner();

  // Read current round
  const { data: currentRound } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'currentRound',
  });

  // Read user's ticket count for current round
  const { data: userTicketCount, refetch: refetchTicketCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getUserTicketCount',
    args: address && currentRound ? [address, currentRound] : undefined,
  });

  // Read prize pool for current round
  const { data: prizePool, refetch: refetchPrizePool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'prizePools',
    args: currentRound ? [currentRound] : undefined,
  });

  // Read total tickets in current round
  const { data: totalTickets, refetch: refetchTotalTickets } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'totalTicketsInRound',
    args: currentRound ? [currentRound] : undefined,
  });


  // Check if round is drawn
  const { data: isRoundDrawn } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isRoundDrawn',
    args: currentRound ? [currentRound] : undefined,
  });


  const handlePurchaseTicket = async () => {
    if (!instance || !isInitialized || !signer || !address) {
      setMessage({ type: 'error', text: 'Please ensure wallet is connected and FHE is initialized' });
      return;
    }

    const number = parseInt(ticketNumber);
    if (isNaN(number) || number < MIN_NUMBER || number > MAX_NUMBER) {
      setMessage({ type: 'error', text: `Please enter a valid number between ${MIN_NUMBER} and ${MAX_NUMBER}` });
      return;
    }

    if (isRoundDrawn) {
      setMessage({ type: 'error', text: 'Current round has already been drawn. Please wait for the next round.' });
      return;
    }

    try {
      setIsLoading(true);
      setMessage(null);

      // Create encrypted input for the ticket number
      const input = instance.createEncryptedInput(CONTRACT_ADDRESS, address);
      input.add8(number);
      const encryptedInput = await input.encrypt();

      // Get the actual signer (it's a Promise)
      const ethersSigner = await signer;

      // Purchase ticket with encrypted number using ethers
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, ethersSigner);
      const tx = await contract.buyTicket(
        encryptedInput.handles[0],
        encryptedInput.inputProof,
        { value: ethers.parseEther(TICKET_PRICE) }
      );

      setMessage({ type: 'info', text: 'Transaction sent, waiting for confirmation...' });

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);
      console.log('Transaction hash:', receipt.hash);
      console.log('Block number:', receipt.blockNumber);

      setMessage({ type: 'success', text: 'Ticket purchased successfully!' });
      setTicketNumber('');
      setIsLoading(false);

    } catch (err) {
      console.error('Error purchasing ticket:', err);
      setMessage({ type: 'error', text: 'Failed to encrypt ticket number or send transaction' });
      setIsLoading(false);
    }
  };

  const handleNumberChange = (value: string) => {
    // Only allow numbers
    const sanitized = value.replace(/[^0-9]/g, '');
    if (sanitized.length <= 2) {
      setTicketNumber(sanitized);
    }
  };

  const isButtonDisabled = isLoading || !ticketNumber || !isInitialized || isRoundDrawn;

  return (
    <div className="lottery-section">
      <h2 className="section-title">Buy Lottery Ticket</h2>

      {/* Game Info */}
      <div className="info-grid">
        <div className="info-card">
          <div className="info-card-title">Current Round</div>
          <div className="info-card-value">{currentRound?.toString() || '0'}</div>
        </div>
        <div className="info-card">
          <div className="info-card-title">Ticket Price</div>
          <div className="info-card-value">{TICKET_PRICE} ETH</div>
        </div>
        <div className="info-card">
          <div className="info-card-title">Your Tickets</div>
          <div className="info-card-value">{userTicketCount?.toString() || '0'}</div>
        </div>
        <div className="info-card">
          <div className="info-card-title">Total Tickets</div>
          <div className="info-card-value">{totalTickets?.toString() || '0'}</div>
        </div>
      </div>

      {/* Prize Pool */}
      {prizePool && prizePool > 0n && (
        <div className="status-card">
          <div className="status-title">Current Prize Pool</div>
          <div className="status-value">{formatEther(prizePool)} ETH</div>
        </div>
      )}

      {/* Round Status */}
      {isRoundDrawn && (
        <div className="alert alert-info">
          Current round has been drawn. Please wait for the next round to start.
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Ticket Purchase Form */}
      <div className="form-group">
        <label className="form-label">
          Lottery Number ({MIN_NUMBER}-{MAX_NUMBER})
        </label>
        <input
          type="text"
          value={ticketNumber}
          onChange={(e) => handleNumberChange(e.target.value)}
          placeholder={`Enter number between ${MIN_NUMBER} and ${MAX_NUMBER}`}
          className="form-input"
          maxLength={2}
          disabled={isLoading || !isInitialized || isRoundDrawn}
        />
        <div style={{ fontSize: '0.875rem', color: '#6b7280', marginTop: '0.5rem' }}>
          Your number will be encrypted and kept private until you check for winnings.
        </div>
      </div>

      <button
        onClick={handlePurchaseTicket}
        disabled={isButtonDisabled}
        className="lottery-button"
        style={{ width: '100%' }}
      >
        {isLoading ? (
          <div className="loading-button">
            <div className="loading-spinner"></div>
            Processing...
          </div>
        ) : (
          `Buy Ticket for ${TICKET_PRICE} ETH`
        )}
      </button>

      {/* Game Rules */}
      <div className="status-card" style={{ marginTop: '2rem' }}>
        <div className="status-title">Game Rules</div>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', color: '#6b7280' }}>
          <li>Choose a number between {MIN_NUMBER} and {MAX_NUMBER}</li>
          <li>Each ticket costs {TICKET_PRICE} ETH</li>
          <li>Your number is encrypted and kept private</li>
          <li>When the lottery is drawn, you can check if you won</li>
          <li>Winners get the entire prize pool for that round</li>
        </ul>
      </div>
    </div>
  );
}