// Contract addresses and ABI
export const CONTRACTS = {
  SEPOLIA: {
    address: '0x0000000000000000000000000000000000000000', // Will be updated after deployment
    blockNumber: 1,
  },
  LOCALHOST: {
    address: '0x0000000000000000000000000000000000000000', // Will be updated after deployment
    blockNumber: 1,
  },
} as const;

// ZLottery contract ABI (simplified for frontend use)
export const ZLOTTERY_ABI = [
  // Constants
  'function TICKET_PRICE() external view returns (uint256)',
  'function MIN_NUMBER() external view returns (uint8)',
  'function MAX_NUMBER() external view returns (uint8)',
  'function owner() external view returns (address)',
  'function currentRound() external view returns (uint256)',
  
  // Ticket operations
  'function buyTicket(bytes32 encryptedNumber, bytes calldata inputProof) external payable',
  'function getUserTicketCount(address user, uint256 round) external view returns (uint256)',
  'function getUserTicket(uint256 round, uint256 ticketIndex) external view returns (bytes32)',
  
  // Lottery operations  
  'function drawLottery() external',
  'function isRoundDrawn(uint256 round) external view returns (bool)',
  'function getWinningNumber(uint256 round) external view returns (bytes32)',
  'function makeWinningNumberPublic(uint256 round) external',
  
  // Prize operations
  'function checkTicket(uint256 round, uint256 ticketIndex) external returns (bytes32)',
  'function claimPrizeSimple(uint256 round, uint256 ticketIndex) external',
  'function hasClaimed(uint256 round, address user) external view returns (bool)',
  
  // View functions
  'function totalTicketsInRound(uint256 round) external view returns (uint256)',
  'function prizePools(uint256 round) external view returns (uint256)',
  'function getBalance() external view returns (uint256)',
  
  // Events
  'event TicketPurchased(address indexed user, uint256 indexed round, uint256 ticketIndex)',
  'event LotteryDrawn(uint256 indexed round)',
  'event PrizeClaimed(address indexed user, uint256 indexed round, uint256 amount)',
] as const;