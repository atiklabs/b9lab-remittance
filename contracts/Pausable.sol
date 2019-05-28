pragma solidity ^0.5.0;

import "./Owned.sol";

/**
 * @title Pausable
 * @dev Base contract which allows children to implement an emergency stop mechanism.
 */
contract Pausable is Ownable {
    event Paused(address indexed account);
    event Unpaused(address indexed account);
    event LogKilled(address indexed account);

    bool private _paused;
    bool private _killSwitch = false;

    constructor (bool paused) internal {
        _paused = paused;
    }

    /**
     * @return True if it's paused, false otherwise.
     */
    function isPaused() public view returns (bool) {
        return _paused;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    modifier whenNotPaused() {
        require(!_paused, "Pausable: paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when the contract is paused.
     */
    modifier whenPaused() {
        require(_paused, "Pausable: not paused");
        _;
    }

    /**
     * @dev Modifier to make a function callable only when contract is alive.
     */
    modifier onlyAlive() {
        require(_killSwitch == false, "The contract is dead");
        _;
    }

    /**
     * @dev Called by a pauser to pause, triggers stopped state.
     */
    function pause() public onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    /**
     * @dev Called by a pauser to unpause, returns to normal state.
     */
    function unpause() public onlyOwner whenPaused onlyAlive {
        _paused = false;
        emit Unpaused(msg.sender);
    }

    /**
     * @dev Turns the contract unusable if modifier used correctly in the contract.
     */
    function kill() public onlyOwner {
        _killSwitch = true;
        _paused = true;
        emit LogKilled(msg.sender);
    }
}