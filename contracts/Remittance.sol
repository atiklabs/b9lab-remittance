pragma solidity >=0.4.21 <0.6.0;

import "./Pausable.sol";
import "./SafeMath.sol";

contract Remittance is Pausable {
    using SafeMath for uint;

    struct RemittanceObj {
        address sender;  // Keeping this to easy up the notification process to "Alice"
        uint amount;
        uint expirationTime;
    }

    mapping(bytes32 => RemittanceObj) public remittances;

    uint constant public maxExpirationDays = 10;
    uint constant public fee = 0.01 ether;
    uint constant public minimumAmountForApplyingFee = 0.1 ether;
    uint public benefitsToWithdraw;

    event LogSendRemittance(bytes32 indexed hash, address indexed sender, uint amount, uint expirationDate);
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
        revert("Use sendRemittance() to send money.");
    }

    /**
     * An utility for the sender to generate the password correctly when creating a new remittance.
     */
    function hashPasswords(address _exchanger, string memory _password) public view returns(bytes32) {
        require(bytes(_password).length != 0, "Password 1 not set");
        return keccak256(abi.encodePacked(address(this), _exchanger, _password));
    }

    /**
     * Alice sends ether to the contract with sendRemittance(), which is unlocked with a cryptographic hash.
     * In order for a 3rd party to withdraw the money, that party will need to give the two keys that
     * generate the hash.
     */
    function sendRemittance(bytes32 _hash, uint _numberOfDays) external payable whenNotPaused {
        require(_hash != bytes32(0), "Do not burn your eth");
        require(msg.value > 0, "You must send something to create a new remittance");
        require(_numberOfDays > 0, "You must set a number of days for the expiration of the remittance");
        require(_numberOfDays <= maxExpirationDays, "Cannot set more than maxExpirationDays");
        require(remittances[_hash].expirationTime == 0, "This hash has been already used in this contract");
        uint expiration = now + _numberOfDays * 1 days;
        remittances[_hash] = RemittanceObj({
            sender: msg.sender,
            amount: msg.value,
            expirationTime: expiration
        });
        emit LogSendRemittance(_hash, msg.sender, msg.value, expiration);
    }

    /**
     * Withdraw remittance
     */
    function withdraw(string memory _password) public whenNotPaused {
        bytes32 hash = hashPasswords(msg.sender, _password);
        RemittanceObj storage remittance = remittances[hash];
        require(remittance.amount > 0, "Remittance already withdrawn or claimed");
        require(now <= remittance.expirationTime, "Remittance has been expired");
        // We collect fee only when the remittance is real and completed
        uint netAmount = remittance.amount;
        if (netAmount >= minimumAmountForApplyingFee) {
            netAmount = netAmount - fee;
            benefitsToWithdraw = benefitsToWithdraw + fee;
        }
        emit LogWithdraw(hash, remittance.sender, netAmount);
        remittance.sender = address(0);  // For gas refund
        remittance.amount = 0;
        msg.sender.transfer(netAmount);
    }

    /**
     * Withdraw expired remittance
     */
    function cancelRemittance(bytes32 _hash) public whenNotPaused {
        RemittanceObj storage remittance = remittances[_hash];
        require(remittance.sender == msg.sender, "Only the sender can cancel a remittance");
        require(remittance.amount > 0, "Remittance already withdrawn or claimed");
        require(now > remittance.expirationTime, "Remittance has not been expired yet");
        uint toWithdraw = remittance.amount;
        emit LogCancelRemittance(_hash, remittance.sender, toWithdraw);
        remittance.sender = address(0);  // For gas refund
        remittance.amount = 0;
        msg.sender.transfer(toWithdraw);
    }

    /**
     * Withdrawing benefits produced by the contract.
     */
    function withdrawBenefits() public onlyOwner whenNotPaused {
        uint benefits = benefitsToWithdraw;
        require(benefits > 0, "There are no fees to withdraw");
        emit LogWithdrawBenefits(benefits);
        benefitsToWithdraw = 0;
        msg.sender.transfer(benefits);
    }
}
