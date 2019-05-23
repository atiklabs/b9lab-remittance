pragma solidity >=0.4.21 <0.6.0;

import "./Pausable.sol";
import "./SafeMath.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    struct Transaction {
        address sender;  // Keeping this to easy up the notification process to "Alice"
        address exchanger;
        uint amount;
        bytes32 hash;  // The operation password1+password2 must calculate this hash to for exchanger to unlock the amount
        uint expirationTime;
    }

    mapping(uint => Transaction) public transactions;
    uint private lastTransaction;

    uint constant public maxExpirationDays = 10;
    uint constant public fee = 0.01 ether;
    uint constant public minimumAmountForApplyingFee = 0.1 ether;
    uint public benefitsToWithdraw;

    event LogNewTransaction(uint indexed transactionId, address indexed sender, address indexed exchanger, uint amount, bytes32 hash, uint expirationDate);
    event LogWithdraw(uint indexed transactionId, address indexed sender, address indexed exchanger, uint amount, uint collectedFee);
    event LogWithdrawExpired(uint indexed transactionId, address indexed sender, address indexed exchanger, uint amount);
    event LogWithdrawBenefits(uint indexed amount);

    modifier onlyBeforeExpirationTime(uint transactionId) {
        require(now <= transactions[transactionId].expirationTime, "Transaction has been expired");
        _;
    }

    modifier onlyAfterExpirationTime(uint transactionId) {
        require(now > transactions[transactionId].expirationTime, "Transaction has not been expired yet");
        _;
    }

    /**
     * Avoid sending money directly to the contract
     */
    function() external payable {
        revert("Use newTransaction() to send money.");
    }

    /**
     * An utility for the sender to generate the password correctly when creating a new transaction.
     */
    function hashPasswords(string memory _password1, string memory _password2) public pure returns(bytes32) {
        require(bytes(_password1).length != 0, "Password 1 not set");
        require(bytes(_password2).length != 0, "Password 2 not set");
        return keccak256(abi.encodePacked(_password1, _password2));
    }

    /**
     * Alice sends ether to the contract with newTransaction(), which is unlocked with a cryptographic hash.
     * In order for a 3rd party to withdraw the money, that party will need to give the two keys that
     * generate the hash.
     */
    function newTransaction(address _exchanger, bytes32 _hash, uint _numberOfDays) external payable whenNotPaused {
        require(_hash != bytes32(0), "Do not burn your eth");
        require(_exchanger != address(0), "Exchanger address is malformed");
        require(msg.value > 0, "You must send something to create a new transaction");
        require(_numberOfDays > 0, "You must set a number of days for the expiration of the transaction");
        require(_numberOfDays <= maxExpirationDays, "Cannot set more than maxExpirationDays");
        uint transactionId = lastTransaction;
        uint expiration = now + _numberOfDays * 1 days;
        transactions[lastTransaction] = Transaction({
            sender: msg.sender,
            exchanger: _exchanger,
            amount: msg.value,
            hash: _hash,
            expirationTime: expiration
        });
        lastTransaction = lastTransaction + 1;
        emit LogNewTransaction(transactionId, msg.sender, _exchanger, msg.value, _hash, expiration);
    }

    /**
     * Withdraw transaction
     */
    function withdraw(uint _transactionId, string memory _password1, string memory _password2) public whenNotPaused onlyBeforeExpirationTime(_transactionId) {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.exchanger == msg.sender, "Only the exchanger can withdraw");
        require(transaction.amount > 0, "Nothing to withdraw");
        bytes32 hash = keccak256(abi.encodePacked(_password1, _password2));
        require(transaction.hash == hash, "You did not provide the correct passwords");
        // We collect fee only when the transaction is real and completed
        uint netAmount = transaction.amount;
        uint collectedFee = 0;
        if (netAmount >= minimumAmountForApplyingFee) {
            netAmount = netAmount - fee;
            benefitsToWithdraw = benefitsToWithdraw + fee;
            collectedFee = fee;
        }
        transaction.amount = 0;
        emit LogWithdraw(_transactionId, transaction.sender, transaction.exchanger, netAmount, collectedFee);
        msg.sender.transfer(netAmount);
    }

    /**
     * Withdraw expired transaction
     */
    function withdrawExpired(uint _transactionId) public whenNotPaused onlyAfterExpirationTime(_transactionId) {
        Transaction storage transaction = transactions[_transactionId];
        require(transaction.sender == msg.sender, "Only the exchanger can withdraw");
        require(transaction.amount > 0, "Nothing to withdraw");
        uint toWithdraw = transaction.amount;
        transaction.amount = 0;
        emit LogWithdrawExpired(_transactionId, transaction.sender, transaction.exchanger, toWithdraw);
        msg.sender.transfer(toWithdraw);
    }

    /**
     * Withdrawing benefits produced by the contract.
     */
    function withdrawBenefits() public onlyOwner {
        uint benefits = benefitsToWithdraw;
        emit LogWithdrawBenefits(benefits);
        msg.sender.transfer(benefits);
    }
}
