// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract SimpleBridge {
    
    struct BridgeRequest {
        address user;
        uint256 amount;
        uint256 timestamp;
        bool claimed;
        string destinationChain;
    }
    
    event EthLocked(
        bytes32 indexed requestId,
        address indexed user,
        uint256 amount,
        uint256 timestamp,
        string destinationChain
    );
    
    event EthClaimed(
        bytes32 indexed requestId,
        address indexed user,
        uint256 amount,
        bytes32 destinationTxHash
    );
    
    mapping(bytes32 => BridgeRequest) public bridgeRequests;
    mapping(bytes32 => bool) public processedTxHashes;
    
    address public relayer;
    address public owner;
    uint256 public minimumAmount = 0.0001 ether;
    uint256 public maximumAmount = 10 ether;
    
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not authorized relayer");
        _;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    constructor(address _relayer) {
        owner = msg.sender;
        relayer = _relayer;
    }
    
 
    function lockEth(string calldata destinationChain) 
        external 
        payable 
        returns (bytes32 requestId) 
    {
        require(msg.value >= minimumAmount, "Amount too small");
        require(msg.value <= maximumAmount, "Amount too large");
        require(bytes(destinationChain).length > 0, "Destination chain required");
        
        requestId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                block.number,
                msg.value,
                destinationChain
            )
        );
        
        bridgeRequests[requestId] = BridgeRequest({
            user: msg.sender,
            amount: msg.value,
            timestamp: block.timestamp,
            claimed: false,
            destinationChain: destinationChain
        });
        
        emit EthLocked(
            requestId, 
            msg.sender, 
            msg.value, 
            block.timestamp, 
            destinationChain
        );
        
        return requestId;
    }

    function claimEth(bytes32 requestId, bytes32 destinationTxHash) external onlyRelayer {
        BridgeRequest storage request = bridgeRequests[requestId];
        
        require(request.user != address(0), "Invalid request");
        require(!request.claimed, "Already claimed");
        require(!processedTxHashes[destinationTxHash], "Tx already processed");
        
        uint256 amount = request.amount;
        request.claimed = true;
        processedTxHashes[destinationTxHash] = true;
        
        (bool success, ) = payable(relayer).call{value: amount}("");
        require(success, "Transfer to relayer failed");
        
        emit EthClaimed(requestId, request.user, amount, destinationTxHash);
    }

    // if relayer is down or missed the lock event the user's fund will be locked so created a func for user to claim the locked eth 
    // after 24hrs but for testing kept it direct
    function emergencyWithdraw(bytes32 requestId) external {
        BridgeRequest storage request = bridgeRequests[requestId];
        
        require(request.user == msg.sender, "Not your request");
        require(!request.claimed, "Already claimed");
        //require(block.timestamp > request.timestamp + 24 hours, "Too early"); 
        require(block.timestamp > request.timestamp , "Too early");
        uint256 amount = request.amount;
        request.claimed = true;
        
        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");
    }
    
    /**
     * @dev Set relayer address
     */
    function setRelayer(address _relayer) external onlyOwner {
        relayer = _relayer;
    }
    
    /**
     * @dev Set bridge limits
     */
    function setLimits(uint256 _min, uint256 _max) external onlyOwner {
        minimumAmount = _min;
        maximumAmount = _max;
    }
    
    /**
     * @dev Get bridge request details
     */
    function getBridgeRequest(bytes32 requestId) 
        external 
        view 
        returns (
            address user, 
            uint256 amount, 
            uint256 timestamp, 
            bool claimed,
            string memory destinationChain
        ) 
    {
        BridgeRequest memory request = bridgeRequests[requestId];
        return (
            request.user, 
            request.amount, 
            request.timestamp, 
            request.claimed,
            request.destinationChain
        );
    }
    
    /**
     * @dev Get contract balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }
    
    /**
     * @dev Owner can withdraw from contract
     */
    function withdrawFees() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No balance");
        
        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "Withdrawal failed");
    }
    
    receive() external payable {
        revert("Use lockEth function");
    }
}