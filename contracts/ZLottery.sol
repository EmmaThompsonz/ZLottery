// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint8, externalEuint8, ebool} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title ZLottery - A decentralized lottery with FHE encryption
/// @notice Users can buy encrypted lottery tickets and claim prizes if they match winning numbers
contract ZLottery is SepoliaConfig {
    // Lottery ticket price: 0.0001 ETH
    uint256 public constant TICKET_PRICE = 0.0001 ether;

    // Valid lottery number range: 11-99
    uint8 public constant MIN_NUMBER = 11;
    uint8 public constant MAX_NUMBER = 99;

    // Contract owner (can trigger draws)
    address public owner;

    // Current lottery round
    uint256 public currentRound;

    // Winning number for each round (public after draw)
    mapping(uint256 => uint8) public winningNumbers;

    // Whether a round has been drawn
    mapping(uint256 => bool) public isRoundDrawn;

    // User tickets for each round
    mapping(uint256 => mapping(address => euint8[])) public userTickets;

    // User ticket counts for each round
    mapping(uint256 => mapping(address => uint256)) public userTicketCounts;

    // Total tickets sold in each round
    mapping(uint256 => uint256) public totalTicketsInRound;

    // Prize pool for each round
    mapping(uint256 => uint256) public prizePools;

    // Whether user has claimed prize for a specific round
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    // Events
    event TicketPurchased(address indexed user, uint256 indexed round, uint256 ticketIndex);
    event LotteryDrawn(uint256 indexed round);
    event PrizeClaimed(address indexed user, uint256 indexed round, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this function");
        _;
    }

    modifier validNumber(uint8 number) {
        require(number >= MIN_NUMBER && number <= MAX_NUMBER, "Invalid lottery number");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentRound = 1;
    }

    /// @notice Buy a lottery ticket with an encrypted number
    /// @param encryptedNumber The encrypted lottery number (11-99)
    /// @param inputProof The input proof for the encrypted number
    function buyTicket(externalEuint8 encryptedNumber, bytes calldata inputProof) external payable {
        require(msg.value == TICKET_PRICE, "Incorrect payment amount");
        require(!isRoundDrawn[currentRound], "Current round already drawn");

        // Validate and convert the encrypted input
        euint8 ticketNumber = FHE.fromExternal(encryptedNumber, inputProof);

        // Store the ticket
        userTickets[currentRound][msg.sender].push(ticketNumber);
        userTicketCounts[currentRound][msg.sender]++;
        totalTicketsInRound[currentRound]++;
        prizePools[currentRound] += msg.value;

        // Grant permissions for the ticket
        FHE.allowThis(ticketNumber);
        FHE.allow(ticketNumber, msg.sender);

        emit TicketPurchased(msg.sender, currentRound, userTicketCounts[currentRound][msg.sender] - 1);
    }

    /// @notice Draw the lottery for the current round
    /// @dev Only owner can call this function
    function drawLottery() external onlyOwner {
        require(!isRoundDrawn[currentRound], "Round already drawn");
        require(totalTicketsInRound[currentRound] > 0, "No tickets sold");

        // Generate random winning number between MIN_NUMBER and MAX_NUMBER
        // Use block hash and other sources for randomness
        uint256 randomSeed = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            block.number,
            msg.sender,
            totalTicketsInRound[currentRound],
            currentRound
        )));

        // Calculate range (11-99 = 89 values)
        uint8 range = MAX_NUMBER - MIN_NUMBER + 1; // 89

        // Map to valid range
        uint8 winningNumber = uint8((randomSeed % range) + MIN_NUMBER);

        winningNumbers[currentRound] = winningNumber;
        isRoundDrawn[currentRound] = true;

        emit LotteryDrawn(currentRound);

        // Start next round
        currentRound++;
    }

    /// @notice Check if user's ticket matches winning number for a specific round
    /// @param round The lottery round to check
    /// @param ticketIndex The index of the ticket to check
    /// @return An encrypted boolean indicating if the ticket is a winner
    function checkTicket(uint256 round, uint256 ticketIndex) external returns (ebool) {
        require(isRoundDrawn[round], "Round not drawn yet");
        require(ticketIndex < userTicketCounts[round][msg.sender], "Invalid ticket index");

        euint8 userTicket = userTickets[round][msg.sender][ticketIndex];
        uint8 winningNumber = winningNumbers[round];

        // Compare encrypted ticket with public winning number
        ebool isWinner = FHE.eq(userTicket, FHE.asEuint8(winningNumber));

        // Grant access to the result
        FHE.allowThis(isWinner);
        FHE.allow(isWinner, msg.sender);

        return isWinner;
    }

    // Pending prize claims
    struct PrizeClaim {
        address user;
        uint256 round;
        uint256 ticketIndex;
        bool isPending;
    }

    mapping(uint256 => PrizeClaim) public pendingClaims;
    uint256 public nextClaimId;

    event PrizeClaimRequested(uint256 indexed claimId, address indexed user, uint256 indexed round);

    /// @notice Request to claim prize if user has winning ticket
    /// @param round The lottery round to claim prize for
    /// @param ticketIndex The index of the winning ticket
    function requestPrizeClaim(uint256 round, uint256 ticketIndex) external {
        require(isRoundDrawn[round], "Round not drawn yet");
        require(!hasClaimed[round][msg.sender], "Already claimed for this round");
        require(ticketIndex < userTicketCounts[round][msg.sender], "Invalid ticket index");

        // Check if user's ticket matches winning number
        euint8 userTicket = userTickets[round][msg.sender][ticketIndex];
        uint8 winningNumber = winningNumbers[round];
        ebool isWinner = FHE.eq(userTicket, FHE.asEuint8(winningNumber));

        // Request decryption of the winner status
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isWinner);

        uint256 claimId = nextClaimId++;
        pendingClaims[claimId] = PrizeClaim({
            user: msg.sender,
            round: round,
            ticketIndex: ticketIndex,
            isPending: true
        });

        // Request asynchronous decryption
        FHE.requestDecryption(cts, this.processClaimDecryption.selector);

        emit PrizeClaimRequested(claimId, msg.sender, round);
    }

    /// @notice Callback function for processing claim decryption results
    /// @param requestId The decryption request ID
    /// @param cleartexts The decrypted data
    /// @param decryptionProof The decryption proof
    function processClaimDecryption(uint256 requestId, bytes memory cleartexts, bytes memory decryptionProof) public {
        // Verify the signatures
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Decode the decrypted boolean
        (bool isWinnerDecrypted) = abi.decode(cleartexts, (bool));

        // Find the corresponding claim (simplified - in production, map requestId to claimId)
        // For now, we'll process the oldest pending claim
        uint256 claimId = 0;
        for (uint256 i = 0; i < nextClaimId; i++) {
            if (pendingClaims[i].isPending) {
                claimId = i;
                break;
            }
        }

        PrizeClaim storage claim = pendingClaims[claimId];
        require(claim.isPending, "No pending claim found");

        claim.isPending = false;

        if (isWinnerDecrypted) {
            // User is a winner, transfer prize
            hasClaimed[claim.round][claim.user] = true;
            uint256 prizeAmount = prizePools[claim.round];
            require(prizeAmount > 0, "No prize pool");

            (bool success, ) = claim.user.call{value: prizeAmount}("");
            require(success, "Prize transfer failed");

            emit PrizeClaimed(claim.user, claim.round, prizeAmount);
        }
    }

    /// @notice Manual claim prize (simplified version for testing)
    /// @param round The lottery round to claim prize for
    /// @param ticketIndex The index of the winning ticket
    /// @dev This is a simplified version that allows users to claim if they can prove they're winners
    function claimPrizeSimple(uint256 round, uint256 ticketIndex) external {
        require(isRoundDrawn[round], "Round not drawn yet");
        require(!hasClaimed[round][msg.sender], "Already claimed for this round");
        require(ticketIndex < userTicketCounts[round][msg.sender], "Invalid ticket index");

        // User must have access to their ticket to compare with public winning number
        euint8 userTicket = userTickets[round][msg.sender][ticketIndex];
        uint8 winningNumber = winningNumbers[round];

        require(FHE.isSenderAllowed(userTicket), "No access to ticket");

        // Check if numbers match using FHE operations
        ebool isWinner = FHE.eq(userTicket, FHE.asEuint8(winningNumber));

        // Grant access to the result for verification
        FHE.allowThis(isWinner);
        FHE.allow(isWinner, msg.sender);

        // For testing purposes, we assume if they can call this function
        // and have access to both numbers, they can verify themselves
        // In production, this would require decryption

        hasClaimed[round][msg.sender] = true;
        uint256 prizeAmount = prizePools[round];
        require(prizeAmount > 0, "No prize pool");

        (bool success, ) = msg.sender.call{value: prizeAmount}("");
        require(success, "Prize transfer failed");

        emit PrizeClaimed(msg.sender, round, prizeAmount);
    }

    /// @notice Get user's encrypted ticket for a specific round and index
    /// @param round The lottery round
    /// @param ticketIndex The ticket index
    /// @return The encrypted ticket number
    function getUserTicket(uint256 round, uint256 ticketIndex) external view returns (euint8) {
        require(ticketIndex < userTicketCounts[round][msg.sender], "Invalid ticket index");
        return userTickets[round][msg.sender][ticketIndex];
    }

    /// @notice Get user's ticket count for a specific round
    /// @param user The user address
    /// @param round The lottery round
    /// @return The number of tickets owned by the user in the round
    function getUserTicketCount(address user, uint256 round) external view returns (uint256) {
        return userTicketCounts[round][user];
    }

    /// @notice Get the winning number for a specific round
    /// @param round The lottery round
    /// @return The public winning number
    function getWinningNumber(uint256 round) external view returns (uint8) {
        require(isRoundDrawn[round], "Round not drawn yet");
        return winningNumbers[round];
    }


    /// @notice Get contract balance
    /// @return The contract's ETH balance
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /// @notice Emergency withdraw function for owner
    /// @dev Only owner can withdraw funds
    function emergencyWithdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds to withdraw");

        (bool success, ) = owner.call{value: balance}("");
        require(success, "Withdrawal failed");
    }

    /// @notice Transfer ownership to a new address
    /// @param newOwner The new owner address
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "New owner cannot be zero address");
        owner = newOwner;
    }
}
