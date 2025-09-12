// Type definitions for the lottery application

export interface RoundSummaryProps {
  round: number;
  contractAddress: `0x${string}`;
  isSelected: boolean;
  onSelect: () => void;
}

export interface ComponentProps {
  contractAddress: `0x${string}`;
  currentRound?: bigint;
  ticketPrice?: bigint;
}