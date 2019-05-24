[![Build Status](https://travis-ci.org/atik-lab/b9lab-remittance.svg)](https://travis-ci.org/atik-lab/b9lab-remittance)

# b9lab Remittance

This is the second project of the Community Blockstars 2019 - Ethereum Developer Course.

## The problem

* There are three people: Alice, Bob & Carol.
* Alice wants to send funds to Bob, but she only has ether. Bob wants to be paid in local currency. Carol runs an exchange shop that converts ether to local currency.
* To get the funds to Bob, Alice will allow the funds to be transferred through Carol's exchange shop. Carol will collect the ether from Alice and give the local currency to Bob

## What to do

* Alice creates a Remittance contract with Ether in it and a password-puzzle. Alice sends a one-time-password to Bob. And another one-time-password to Carol.
* Then Bob gives Carol his one-time-password in person.
* Then Carol with the two password the Remittance contract yields the Ether to Carol.
* Now Carol gives the local currency to Bob and Alice is notified that Carol got the Ether.

## Extra

* Add a deadline, after which Alice can claim back the unchallenged Ether.
* Add a limit to how far in the future the deadline can be
* Add a kill switch to the whole contract
* Make the contract a utility that can be used by David, Emma and anybody with an address
* Make you, the owner of the contract, take a cut of the Ethers smaller than what it would cost Alice to deploy the same contract herself

## Tip

* The usual hash function in Solidity is keccak256(abi.encodePacked(param1, param2, ...)).


