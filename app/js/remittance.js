require("file-loader?name=../index.html!../index.html");
require("file-loader?name=../css/normalize.css!../css/normalize.css");
require("file-loader?name=../css/skeleton.css!../css/skeleton.css");
require("file-loader?name=../css/style.css!../css/style.css");

const Web3 = require("web3");
const remittanceJson = require("../../build/contracts/Remittance.json");

let remittanceContract;
let web3, accounts, defaultAccount;

window.onload = async function() {

    // Load web3
    if (window.ethereum) {
        web3 = new Web3(window.ethereum);
        try {
            await ethereum.enable();
            accounts = await web3.eth.getAccounts();
        } catch (error) {
            messageError('User denied account access...');
        }
    } else if (window.web3) { // Legacy dapp browsers...
        web3 = new Web3(web3.currentProvider);
        accounts = web3.eth.getAccounts().then(e => accounts = e);
    } else { // Non-dapp browsers...
        web3 = new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8545"));
        accounts = web3.eth.getAccounts().then(e => accounts = e);
        messageError('Non-Ethereum browser detected. Download: https://metamask.io/');
    }
    defaultAccount = accounts[0];
    console.log("Web3 v" + web3.version);

    // Prepare contract
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = remittanceJson.networks[networkId];
    remittanceContract = new web3.eth.Contract(remittanceJson.abi, deployedNetwork.address);

    // Initialize
    remittance.init();
};

module.exports = {

    init: function() {
        remittance.initTable();
        remittance.startWatcher();
    },

    newTransaction: function() {
        let exchanger = document.getElementById("NewTransactionExchanger").value;
        let password1 = document.getElementById("NewTransactionPassword1").value;
        let password2 = document.getElementById("NewTransactionPassword2").value;
        let expirationDays = document.getElementById("NewTransactionExpirationDays").value;
        let amount = document.getElementById("NewTransactionAmount").value;

        remittanceContract.methods.hashPasswords(password1, password2).call()
            .then(hash => {
                messageSuccess("Passwords hash is " + hash);
                remittanceContract.methods.newTransaction(exchanger, hash, expirationDays).send({from: defaultAccount, value: web3.utils.toWei(amount, "ether")})
                    .on('transactionHash', (transactionHash) => messageSuccess("Transaction " + transactionHash))
                    .on('confirmation', (confirmationNumber, receipt) => {
                        if (receipt.status === true && receipt.logs.length === 1) {
                            messageSuccess("Transaction successful");
                        } else {
                            messageError("Transaction status: failed");
                        }
                    })
                    .on('error', error => messageError(error));
            });
    },

    withdraw: function() {
        let transactionId = document.getElementById("WithdrawTransactionId").value;
        let password1 = document.getElementById("WithdrawPassword1").value;
        let password2 = document.getElementById("WithdrawPassword2").value;

        remittanceContract.methods.withdraw(transactionId, password1, password2).send({from: defaultAccount})
            .on('transactionHash', (transactionHash) => messageSuccess("Transaction " + transactionHash))
            .on('confirmation', (confirmationNumber, receipt) => {
                if (receipt.status === true && receipt.logs.length === 1) {
                    messageSuccess("Transaction successful");
                } else {
                    messageError("Transaction status: failed");
                }
            })
            .on('error', error => messageError(error));
    },

    withdrawExpired: function() {
        let transactionId = document.getElementById("ExpiredTransactionId").value;

        remittanceContract.methods.withdrawExpired(transactionId).send({from: defaultAccount})
            .on('transactionHash', (transactionHash) => messageSuccess("Transaction " + transactionHash))
            .on('confirmation', (confirmationNumber, receipt) => {
                if (receipt.status === true && receipt.logs.length === 1) {
                    messageSuccess("Transaction successful");
                } else {
                    messageError("Transaction status: failed");
                }
            })
            .on('error', error => messageError(error));
    },

    withdrawBenefits: function() {
        remittanceContract.methods.withdrawBenefits().send({from: defaultAccount})
            .on('transactionHash', (transactionHash) => messageSuccess("Transaction " + transactionHash))
            .on('confirmation', (confirmationNumber, receipt) => {
                if (receipt.status === true && receipt.logs.length === 1) {
                    messageSuccess("Transaction successful");
                } else {
                    messageError("Transaction status: failed");
                }
            })
            .on('error', error => messageError(error));
    },

    // Show to the user his balance available to withdraw
    initTable: function() {
        remittanceContract.getPastEvents('allEvents', {fromBlock: 0, toBlock: "latest"})
            .then(events => {
                for (let i = 0; i < events.length; i += 1) {
                    remittance.parseEvent(events[i]);
                }
            })
            .catch(error => messageError("Error fetching events: " + error));
    },

    // Watcher to update gui
    startWatcher: function() {
        remittanceContract.events.allEvents()
            .on('data', event => {
                remittance.parseEvent(event);
            })
            .on('error', error => messageError("Error on event: " + error));
    },

    // Update UI with the event
    parseEvent: function(event) {
        switch (event.event) {
            case 'LogNewTransaction':
                let transactionId = event.returnValues['transactionId'];
                let sender = event.returnValues['sender'];
                let exchanger = event.returnValues['exchanger'];
                let amount = web3.utils.toBN(event.returnValues['amount'].toString()); // BN !== BigNumber
                let expirationDate = event.returnValues['expirationDate'];
                remittance.addTransactionInTable(transactionId, sender, exchanger, amount, expirationDate);
                break;
            case 'LogWithdraw':
                let transactionId2 = event.returnValues['transactionId'];
                let collectedFee = web3.utils.toBN(event.returnValues['collectedFee'].toString()); // BN !== BigNumber
                remittance.setTransactionAmountToZero(transactionId2);
                remittance.updateAvailableBenefits(collectedFee);
                break;
            case 'LogWithdrawExpired':
                let transactionId3 = event.returnValues['transactionId'];
                remittance.setTransactionAmountToZero(transactionId3);
                break;
            case 'LogWithdrawBenefits':
                let benefits = web3.utils.toBN(event.returnValues['amount'].toString()); // BN !== BigNumber
                remittance.updateAvailableBenefits(benefits.neg());
                break;
            default:
                console.log(event);
        }
    },

    addTransactionInTable: function(id, sender, exchanger, amount, expirationTime) {
        let amountEther = web3.utils.fromWei(amount);
        let expirationTimeHuman = new Date(expirationTime*1000).toISOString();
        document.getElementById("TransactionsTableBody").innerHTML += '<tr id="TransactionRow' + id + '"><td>' + id + '</td><td>' + sender + '</td><td>' + exchanger + '</td><td id="TransactionsAmount' + id + '">' + amountEther + '</td><td>' + expirationTimeHuman + '</tr>';
    },

    setTransactionAmountToZero: function(id) {
        document.getElementById("TransactionsAmount" + id).innerHTML = '0';
    },

    // Change contract balance UI
    updateAvailableBenefits: function(amount) {
        let oldAmount = web3.utils.toBN(web3.utils.toWei(document.getElementById("BenefitsAvailable").innerText));
        let newBalance = oldAmount.add(amount);
        document.getElementById("BenefitsAvailable").innerText = web3.utils.fromWei(newBalance.toString())
    }
};

/*
 * Messages and utils
 */

let messageIdCounter = 0;

function messageSuccess(message) {
    let messageBox = document.getElementById("MessageBox");
    let messageId = messageIdCounter;
    let div = document.createElement('div');
    div.id = 'message-id-' + messageId;
    div.className = 'message-success';
    div.innerText = message;
    messageBox.insertBefore(div, messageBox.firstChild);
    messageIdCounter++;
    setTimeout(function(){
        document.getElementById(div.id).remove();
    }, 1000*5); // Every second checkStatus
}

function messageError(message) {
    let messageBox = document.getElementById("MessageBox");
    let messageId = messageIdCounter;
    let div = document.createElement('div');
    div.id = 'message-id-' + messageId;
    div.className = 'message-error';
    div.innerText = message;
    messageBox.insertBefore(div, messageBox.firstChild);
    messageIdCounter++;
    setTimeout(function(){
        document.getElementById(div.id).remove();
    }, 1000*5); // Every second checkStatus
}
