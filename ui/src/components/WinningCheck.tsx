import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../config/contracts';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';


export function WinningCheck() {
  const { address } = useAccount();
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [decryptedTickets, setDecryptedTickets] = useState<Map<number, number>>(new Map());
  const [decryptingIndex, setDecryptingIndex] = useState<number | null>(null);
  const signer = useEthersSigner();
  const { instance, isInitialized } = useZamaInstance();

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


  // Function to decrypt a ticket
  const decryptTicket = async (ticketIndex: number) => {
    if (!instance || !isInitialized || !address || !signer) {
      setMessage({ type: 'error', text: 'Please ensure wallet is connected and FHE is initialized' });
      return;
    }

    try {
      setDecryptingIndex(ticketIndex);
      setMessage(null);

      // Get the encrypted ticket handle from the contract
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await signer);
      const encryptedTicketHandle = await contract.getUserTicket(BigInt(selectedRound), BigInt(ticketIndex));

      // Create keypair for decryption
      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: encryptedTicketHandle,
          contractAddress: CONTRACT_ADDRESS,
        },
      ];

      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = "10";
      const contractAddresses = [CONTRACT_ADDRESS];

      // Create EIP712 signature for decryption
      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signerInstance = await signer;
      const signature = await signerInstance.signTypedData(
        eip712.domain,
        {
          UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
        },
        eip712.message,
      );

      // Perform user decryption
      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace("0x", ""),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decryptedValue = result[encryptedTicketHandle];
      setDecryptedTickets(prev => new Map(prev.set(ticketIndex, decryptedValue)));
      setMessage({ type: 'success', text: `Ticket #${ticketIndex + 1} decrypted: ${decryptedValue}` });

    } catch (err) {
      console.error('Error decrypting ticket:', err);
      setMessage({ type: 'error', text: 'Failed to decrypt ticket' });
    } finally {
      setDecryptingIndex(null);
    }
  };

  const claimPrize = async (ticketIndex: number) => {
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

    if (!userTicketCount || ticketIndex >= Number(userTicketCount)) {
      setMessage({ type: 'error', text: 'Invalid ticket index' });
      return;
    }

    try {
      setIsLoading(true);
      setMessage(null);

      // Claim prize using ethers
      const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, await signer);
      const tx = await contract.claimPrizeSimple(
        BigInt(selectedRound),
        BigInt(ticketIndex)
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

  // Reset decrypted tickets when round changes
  useEffect(() => {
    setDecryptedTickets(new Map());
  }, [selectedRound]);

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

      {/* Current Round Results - Show at top */}
      {selectedRound && isRoundDrawn && winningNumber !== undefined && (
        <div className="status-card">
          <div className="status-title">Round {selectedRound} Results</div>
          <div className="winning-number">
            Winning Number: {winningNumber}
          </div>
        </div>
      )}

      {/* Tickets List */}
      {userTicketCount && Number(userTicketCount) > 0 && (
        <div className="form-group">
          <label className="form-label">Your Tickets for Round {selectedRound}</label>
          <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
            {Array.from({ length: Number(userTicketCount) }, (_, index) => {
              const decryptedValue = decryptedTickets.get(index);
              const isDecrypting = decryptingIndex === index;
              const isWinner = decryptedValue !== undefined && winningNumber !== undefined && decryptedValue === Number(winningNumber);

              return (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '1rem',
                    backgroundColor: isWinner ? '#f0f9ff' : '#f8fafc',
                    border: isWinner ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span style={{ fontWeight: '500', minWidth: '80px' }}>
                      Ticket #{index + 1}:
                    </span>
                    <span style={{
                      fontFamily: 'monospace',
                      fontSize: '1.125rem',
                      color: decryptedValue !== undefined ? (isWinner ? '#3b82f6' : '#1f2937') : '#6b7280'
                    }}>
                      {decryptedValue !== undefined ? decryptedValue : '***'}
                    </span>
                    {isWinner && (
                      <span style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        borderRadius: '4px',
                        fontSize: '0.875rem',
                        fontWeight: '500'
                      }}>
                        WINNER!
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {decryptedValue === undefined ? (
                      <button
                        onClick={() => decryptTicket(index)}
                        disabled={isDecrypting || !isInitialized}
                        style={{
                          padding: '0.5rem 1rem',
                          backgroundColor: '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: isDecrypting ? 'not-allowed' : 'pointer',
                          opacity: isDecrypting ? 0.6 : 1,
                          fontSize: '0.875rem'
                        }}
                      >
                        {isDecrypting ? 'Decrypting...' : 'Decrypt'}
                      </button>
                    ) : (
                      isRoundDrawn && !hasClaimed && (
                        <button
                          onClick={() => claimPrize(index)}
                          disabled={isLoading}
                          style={{
                            padding: '0.5rem 1rem',
                            backgroundColor: isWinner ? '#059669' : '#6b7280',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.6 : 1,
                            fontSize: '0.875rem'
                          }}
                        >
                          {isLoading ? 'Claiming...' : (isWinner ? 'Claim Prize!' : 'Try Claim')}
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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


      {/* Instructions */}
      <div className="status-card" style={{ marginTop: '2rem' }}>
        <div className="status-title">How to Check & Claim</div>
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', color: '#6b7280' }}>
          <li>Select a round to view your tickets for that round</li>
          <li>Your tickets are shown in encrypted form (***) to protect privacy</li>
          <li>Click "Decrypt" to reveal the actual number on each ticket</li>
          <li>Once decrypted, winning tickets will be highlighted in blue</li>
          <li>Click "Claim Prize!" on winning tickets to claim your reward</li>
          <li>You can only claim once per round, even if you have multiple winning tickets</li>
          <li>Decryption requires wallet signature for security</li>
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