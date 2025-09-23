import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';


export function WinningCheck() {
  const { address } = useAccount();
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [selectedTicketIndex, setSelectedTicketIndex] = useState<number>(0);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const signer = useEthersSigner();

  // Read current round
  const { data: currentRound } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'currentRound',
  });

  // Read user ticket count for selected round
  const { data: userTicketCount } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getUserTicketCount',
    args: address && selectedRound ? [address, BigInt(selectedRound)] : undefined,
  });

  // Check if selected round is drawn
  const { data: isRoundDrawn } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'isRoundDrawn',
    args: selectedRound ? [BigInt(selectedRound)] : undefined,
  });

  // Get winning number for selected round (if drawn)
  const { data: winningNumber } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getWinningNumber',
    args: selectedRound && isRoundDrawn ? [BigInt(selectedRound)] : undefined,
  });

  // Get prize pool for selected round
  const { data: prizePool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'prizePools',
    args: selectedRound ? [BigInt(selectedRound)] : undefined,
  });

  // Check if user has claimed for selected round
  const { data: hasClaimed, refetch: refetchHasClaimed } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'hasClaimed',
    args: address && selectedRound ? [BigInt(selectedRound), address] : undefined,
  });


  const claimPrize = async () => {
    if (!address) {
      setMessage({ type: 'error', text: 'Please connect your wallet' });
      return;
    }

    if (!signer) {
      setMessage({ type: 'error', text: 'Signer not available' });
      return;
    }

    if (!isRoundDrawn) {
      setMessage({ type: 'error', text: 'This round has not been drawn yet' });
      return;
    }

    if (hasClaimed) {
      setMessage({ type: 'error', text: 'You have already claimed for this round' });
      return;
    }

    if (!userTicketCount || selectedTicketIndex >= Number(userTicketCount)) {
      setMessage({ type: 'error', text: 'Invalid ticket index' });
      return;
    }

    try {
      setIsLoading(true);
      setMessage(null);

      // Claim prize using ethers
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
      const tx = await contract.claimPrizeSimple(
        BigInt(selectedRound),
        BigInt(selectedTicketIndex)
      );

      setMessage({ type: 'info', text: 'Transaction sent, waiting for confirmation...' });

      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      setMessage({ type: 'success', text: 'Prize claimed successfully!' });
      refetchHasClaimed();
      setIsLoading(false);

    } catch (err) {
      console.error('Error claiming prize:', err);
      setMessage({ type: 'error', text: 'Failed to claim prize' });
      setIsLoading(false);
    }
  };


  // Generate round options (current round and previous 4)
  const roundOptions = currentRound ? Array.from({ length: Math.min(Number(currentRound), 5) }, (_, i) => Number(currentRound) - i) : [];

  // Generate ticket index options
  const ticketOptions = userTicketCount ? Array.from({ length: Number(userTicketCount) }, (_, i) => i) : [];

  return (
    <div className="lottery-section">
      <h2 className="section-title">Check Your Tickets</h2>

      {/* Round Selection */}
      <div className="form-group">
        <label className="form-label">Select Round</label>
        <select
          value={selectedRound}
          onChange={(e) => setSelectedRound(Number(e.target.value))}
          className="form-input"
        >
          <option value="">Select a round</option>
          {roundOptions.map(round => (
            <option key={round} value={round}>
              Round {round} {round === Number(currentRound) ? '(Current)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Ticket Selection */}
      {userTicketCount && Number(userTicketCount) > 0 && (
        <div className="form-group">
          <label className="form-label">Select Your Ticket</label>
          <select
            value={selectedTicketIndex}
            onChange={(e) => setSelectedTicketIndex(Number(e.target.value))}
            className="form-input"
          >
            {ticketOptions.map(index => (
              <option key={index} value={index}>
                Ticket #{index + 1}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Round Info */}
      {selectedRound && (
        <div className="info-grid">
          <div className="info-card">
            <div className="info-card-title">Round Status</div>
            <div className="info-card-value" style={{ color: isRoundDrawn ? '#059669' : '#f59e0b' }}>
              {isRoundDrawn ? 'Drawn' : 'Pending'}
            </div>
          </div>
          <div className="info-card">
            <div className="info-card-title">Your Tickets</div>
            <div className="info-card-value">{userTicketCount?.toString() || '0'}</div>
          </div>
          <div className="info-card">
            <div className="info-card-title">Prize Pool</div>
            <div className="info-card-value">
              {prizePool ? `${formatEther(prizePool)} ETH` : '0 ETH'}
            </div>
          </div>
          <div className="info-card">
            <div className="info-card-title">Claim Status</div>
            <div className="info-card-value" style={{ color: hasClaimed ? '#059669' : '#6b7280' }}>
              {hasClaimed ? 'Claimed' : 'Not Claimed'}
            </div>
          </div>
        </div>
      )}

      {/* Winning Number */}
      {isRoundDrawn && winningNumber !== undefined && (
        <div className="status-card">
          <div className="status-title">Round {selectedRound} Results</div>
          <div className="winning-number">
            Winning Number: {winningNumber}
          </div>
        </div>
      )}

      {/* No tickets for selected round */}
      {selectedRound && userTicketCount === 0n && (
        <div className="alert alert-info">
          You don't have any tickets for Round {selectedRound}.
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Action Buttons */}
      {selectedRound && userTicketCount && Number(userTicketCount) > 0 && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
          {isRoundDrawn ? (
            <button
              onClick={claimPrize}
              disabled={hasClaimed || isLoading}
              className="lottery-button"
              style={{ flex: 1 }}
            >
              {isLoading ? (
                <div className="loading-button">
                  <div className="loading-spinner"></div>
                  Processing...
                </div>
              ) : hasClaimed ? (
                'Already Claimed'
              ) : (
                'Claim Prize (if winner)'
              )}
            </button>
          ) : (
            <div className="alert alert-info" style={{ flex: 1, margin: 0 }}>
              Round {selectedRound} has not been drawn yet. Please wait for the draw.
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="status-card" style={{ marginTop: '2rem' }}>
        <div className="status-title">How to Check & Claim</div>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', color: '#6b7280' }}>
          <li>Select a round and your ticket to check</li>
          <li>You can only check tickets for rounds that have been drawn</li>
          <li>Click "Claim Prize" to attempt claiming - it will only work if your encrypted ticket matches the winning number</li>
          <li>The contract automatically checks your encrypted number against the public winning number</li>
          <li>You can only claim once per round, even if you have multiple tickets</li>
          <li>If your ticket doesn't match, the transaction will fail and you won't pay gas</li>
        </ul>
      </div>

      {/* Game Stats */}
      <div className="status-card">
        <div className="status-title">Recent Rounds</div>
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          {roundOptions.slice(1).map((round) => (
            <RoundSummary key={round} roundNumber={round} />
          ))}
        </div>
        {roundOptions.length <= 1 && (
          <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
            No previous rounds to display
          </div>
        )}
      </div>
    </div>
  );
}

function RoundSummary({ roundNumber }: { roundNumber: number }) {
  const { data: winningNumber } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'getWinningNumber',
    args: [BigInt(roundNumber)],
  });

  const { data: prizePool } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'prizePools',
    args: [BigInt(roundNumber)],
  });

  const { data: totalTickets } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: CONTRACT_ABI,
    functionName: 'totalTicketsInRound',
    args: [BigInt(roundNumber)],
  });

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0.75rem',
      backgroundColor: '#f8fafc',
      borderRadius: '8px',
      fontSize: '0.875rem'
    }}>
      <span style={{ fontWeight: '500' }}>Round {roundNumber}</span>
      <span>
        Winning: {winningNumber?.toString() || 'N/A'}
      </span>
      <span style={{ color: '#6b7280' }}>
        Tickets: {totalTickets?.toString() || '0'}
      </span>
      <span style={{ color: '#6b7280' }}>
        Pool: {prizePool ? `${formatEther(prizePool)} ETH` : '0 ETH'}
      </span>
    </div>
  );
}