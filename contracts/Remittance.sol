pragma solidity >=0.4.21 <0.6.0;

import "./Pausable.sol";
import "./SafeMath.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    struct Transaction {
        address sender;  // Keeping this to easy up the notification process to "Alice"
        address exchanger;
        uint amount;
        uint expirationTime;
    }

    mapping(bytes32 => Transaction) public transactions;

    bool private _killSwitch = false;

    uint constant public maxExpirationDays = 10;
    uint constant public fee = 0.01 ether;
    uint constant public minimumAmountForApplyingFee = 0.1 ether;
    uint public benefitsToWithdraw;

    event LogNewTransaction(bytes32 indexed hash, address indexed sender, address indexed exchanger, uint amount, uint expirationDate);
    event LogWithdraw(bytes32 indexed hash, address indexed sender, address indexed exchanger, uint amount);
    event LogWithdrawExpired(bytes32 indexed hash, address indexed sender, address indexed exchanger, uint amount);
    event LogWithdrawBenefits(uint indexed amount);
    event LogKilled();

    modifier onlyBeforeExpirationTime(bytes32 _hash) {
        require(now <= transactions[_hash].expirationTime, "Transaction has been expired");
        _;
    }

    modifier onlyAfterExpirationTime(bytes32 _hash) {
        require(now > transactions[_hash].expirationTime, "Transaction has not been expired yet");
        _;
    }

    modifier onlyAlive() {
        require(_killSwitch == false, "The contract is dead");
        _;
    }

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
    function hashPasswords(string memory _password) public view returns(bytes32) {
        require(bytes(_password).length != 0, "Password 1 not set");
        return keccak256(abi.encodePacked(address(this), _password));
    }

    /**
     * Alice sends ether to the contract with newTransaction(), which is unlocked with a cryptographic hash.
     * In order for a 3rd party to withdraw the money, that party will need to give the two keys that
     * generate the hash.
     */
    function newTransaction(address _exchanger, bytes32 _hash, uint _numberOfDays) external payable whenNotPaused onlyAlive {
        require(_hash != bytes32(0), "Do not burn your eth");
        require(_exchanger != address(0), "Exchanger address is malformed");
        require(msg.value > 0, "You must send something to create a new transaction");
        require(_numberOfDays > 0, "You must set a number of days for the expiration of the transaction");
        require(_numberOfDays <= maxExpirationDays, "Cannot set more than maxExpirationDays");
        require(transactions[_hash].expirationTime == 0, "This password has been already used in this contract");
        uint expiration = now + _numberOfDays * 1 days;
        transactions[_hash] = Transaction({
            sender: msg.sender,
            exchanger: _exchanger,
            amount: msg.value,
            expirationTime: expiration
        });
        emit LogNewTransaction(_hash, msg.sender, _exchanger, msg.value, expiration);
    }

    /**
     * Withdraw transaction
     */
    function withdraw(bytes32 _hash, string memory _password) public whenNotPaused onlyAlive onlyBeforeExpirationTime(_hash) {
        Transaction storage transaction = transactions[_hash];
        require(transaction.exchanger == msg.sender, "Only the exchanger can withdraw");
        require(transaction.amount > 0, "Nothing to withdraw");
        bytes32 hash = keccak256(abi.encodePacked(address(this), _password));
        require(hash == _hash, "You did not provide the correct passwords");
        // We collect fee only when the transaction is real and completed
        uint netAmount = transaction.amount;
        if (netAmount >= minimumAmountForApplyingFee) {
            netAmount = netAmount - fee;
            benefitsToWithdraw = benefitsToWithdraw + fee;
        }
        transaction.amount = 0;
        emit LogWithdraw(_hash, transaction.sender, transaction.exchanger, netAmount);
        msg.sender.transfer(netAmount);
    }

    /**
     * Withdraw expired transaction
     */
    function withdrawExpired(bytes32 _hash) public whenNotPaused onlyAfterExpirationTime(_hash) onlyAlive {
        Transaction storage transaction = transactions[_hash];
        require(transaction.sender == msg.sender, "Only the exchanger can withdraw");
        require(transaction.amount > 0, "Nothing to withdraw");
        uint toWithdraw = transaction.amount;
        transaction.amount = 0;
        emit LogWithdrawExpired(_hash, transaction.sender, transaction.exchanger, toWithdraw);
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

    /**
     * Is this function is called the program won't run again
     */
    function kill() public onlyOwner {
        _killSwitch = true;
        emit LogKilled();
    }
}
