pragma solidity >=0.4.21 <0.6.0;

import "./Pausable.sol";
import "./SafeMath.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    struct Transaction {
        address sender;  // Keeping this to easy up the notification process to "Alice"
        uint amount;
        uint expirationTime;
    }

    mapping(bytes32 => Transaction) public transactions;

    uint constant public maxExpirationDays = 10;
    uint constant public fee = 0.01 ether;
    uint constant public minimumAmountForApplyingFee = 0.1 ether;
    uint public benefitsToWithdraw;

    event LogNewTransaction(bytes32 indexed hash, address indexed sender, uint amount, uint expirationDate);
    event LogWithdraw(bytes32 indexed hash, address indexed sender, uint amount);
    event LogCancelRemittance(bytes32 indexed hash, address indexed sender, uint amount);
    event LogWithdrawBenefits(uint indexed amount);

    /**
     * Constructor
     */
    constructor (bool paused) Pausable(paused) public {}

    /**
     * Avoid sending money directly to the contract
     */
    function() external payable {
        revert("Use newTransaction() to send money.");
    }

    /**
     * An utility for the sender to generate the password correctly when creating a new transaction.
     */
    function hashPasswords(address _exchanger, string memory _password) public view returns(bytes32) {
        require(bytes(_password).length != 0, "Password 1 not set");
        return keccak256(abi.encodePacked(address(this), _exchanger, _password));
    }

    /**
     * Alice sends ether to the contract with newTransaction(), which is unlocked with a cryptographic hash.
     * In order for a 3rd party to withdraw the money, that party will need to give the two keys that
     * generate the hash.
     */
    function newTransaction(bytes32 _hash, uint _numberOfDays) external payable whenNotPaused onlyAlive {
        require(_hash != bytes32(0), "Do not burn your eth");
        require(msg.value > 0, "You must send something to create a new transaction");
        require(_numberOfDays > 0, "You must set a number of days for the expiration of the transaction");
        require(_numberOfDays <= maxExpirationDays, "Cannot set more than maxExpirationDays");
        require(transactions[_hash].expirationTime == 0, "This hash has been already used in this contract");
        uint expiration = now + _numberOfDays * 1 days;
        transactions[_hash] = Transaction({
            sender: msg.sender,
            amount: msg.value,
            expirationTime: expiration
        });
        emit LogNewTransaction(_hash, msg.sender, msg.value, expiration);
    }

    /**
     * Withdraw transaction
     */
    function withdraw(string memory _password) public whenNotPaused onlyAlive {
        bytes32 hash = hashPasswords(msg.sender, _password);
        Transaction storage transaction = transactions[hash];
        require(transaction.amount > 0, "Remittance already withdrawn or claimed");
        require(now <= transaction.expirationTime, "Transaction has been expired");
        // We collect fee only when the transaction is real and completed
        uint netAmount = transaction.amount;
        if (netAmount >= minimumAmountForApplyingFee) {
            netAmount = netAmount - fee;
            benefitsToWithdraw = benefitsToWithdraw + fee;
        }
        emit LogWithdraw(hash, transaction.sender, netAmount);
        transaction.sender = address(0);  // For gas refund
        transaction.amount = 0;
        msg.sender.transfer(netAmount);
    }

    /**
     * Withdraw expired transaction
     */
    function cancelRemittance(bytes32 _hash) public whenNotPaused onlyAlive {
        Transaction storage transaction = transactions[_hash];
        require(transaction.sender == msg.sender, "Only the sender can cancel a remittance");
        require(transaction.amount > 0, "Remittance already withdrawn or claimed");
        require(now > transaction.expirationTime, "Transaction has not been expired yet");
        uint toWithdraw = transaction.amount;
        emit LogCancelRemittance(_hash, transaction.sender, toWithdraw);
        transaction.sender = address(0);  // For gas refund
        transaction.amount = 0;
        msg.sender.transfer(toWithdraw);
    }

    /**
     * Withdrawing benefits produced by the contract.
     */
    function withdrawBenefits() public onlyOwner onlyAlive {
        uint benefits = benefitsToWithdraw;
        require(benefits > 0, "There are no fees to withdraw");
        emit LogWithdrawBenefits(benefits);
        benefitsToWithdraw = 0;
        msg.sender.transfer(benefits);
    }
}
