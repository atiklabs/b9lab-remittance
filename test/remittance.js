const Remittance = artifacts.require("Remittance.sol");
const expectedExceptionPromise = require("../util/expected-exception-promise.js");
const getTransactionCost = require("../util/get-transaction-cost.js");
const { toWei, toBN } = web3.utils;

contract('Remittance', accounts => {
    const [ owner, alice, bob, carol ] = accounts;
    const quantity = toWei('0.01', 'ether');  // contract won't take fees
    const quantityBN = toBN(quantity);
    const quantityBig = toWei('1', 'ether');  // contract will take fees
    const quantityBigBN = toBN(quantityBig);
    const password = "bananas";
    const password2 = "cherries";
    const secondsInDay = 86400;
    let instance;
    let hash;
    let hash2;
    let feeBN;
    let minimumAmountForApplyingFeeBN;
    let maxExpirationSeconds;

    before("running check if the setup is correct to pass the tests", async function() {

        let aliceBalanceBN = toBN(await web3.eth.getBalance(alice));
        let minimum = toBN(toWei('1', 'ether'));
        assert.isTrue(aliceBalanceBN.gte(minimum));
    });

    beforeEach("deploy and prepare", async function() {

        instance = await Remittance.new(false, {from: owner});
        hash = await instance.hashPasswords(carol, password);
        hash2 = await instance.hashPasswords(carol, password2);
        feeBN = await instance.fee.call();
        minimumAmountForApplyingFeeBN = await instance.minimumAmountForApplyingFee.call();
        maxExpirationSeconds = await instance.maxExpirationSeconds.call();
    });

    describe("hashing passwords", function() {

        it("should fail if password is empty", async function() {

            await expectedExceptionPromise(function() {
                return instance.hashPasswords(carol, "");
            });
        });

        it("should do different hashes in different contracts", async function() {

            let hash1 = await instance.hashPasswords(carol, password);
            let instance2 = await Remittance.new(false, {from: owner});
            let hash2 = await instance2.hashPasswords(carol, password);
            assert.notStrictEqual(hash1, hash2, "Same hash in different contracts.");
        })
    });

    describe("creating a new remittance", function() {

        it("should create a new remittance", async function() {

            let expirationSeconds = secondsInDay*2;
            let aliceInitialBalanceBN = toBN(await web3.eth.getBalance(alice));
            let txObj = await instance.sendRemittance(hash, expirationSeconds, {from: alice, value: quantity});

            // Check event
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['sender'], alice, "Log sender is not correct");
            assert.strictEqual(args['amount'].toString(), quantity, "Log amount is not correct");
            assert.strictEqual(args['hash'], hash, "Log event hash is not correct");

            // Check new alice balance
            // We be also valid to check the contract balance to see that ether did not bounce to another address
            let remittanceCostBN = await getTransactionCost(txObj);
            let aliceNewBalanceBN = toBN(await web3.eth.getBalance(alice));
            let newBalanceCalculation = aliceInitialBalanceBN.sub(remittanceCostBN).sub(quantityBN);
            assert.strictEqual(aliceNewBalanceBN.toString(), newBalanceCalculation.toString(), "Carol did not receive the right amount of funds");

            // Calculate expiration date
            let block = await web3.eth.getBlock('latest');
            let calculatedExpirationTime = block.timestamp + expirationSeconds;
            assert.strictEqual(args['expirationDate'].toString(), calculatedExpirationTime.toString(), "Log expiration time is not correct");

            // Check storage updated as expected
            let newBalanceBN = toBN(await web3.eth.getBalance(instance.address));
            assert.strictEqual(quantityBN.toString(), newBalanceBN.toString(), "Contract does not have the ether we sent.");
            let remittance = await instance.remittances.call(hash);
            assert.strictEqual(remittance['sender'], alice, "Transaction sender is not correct");
            assert.strictEqual(remittance['amount'].toString(), quantity, "Transaction amount is not correct");
            assert.strictEqual(remittance['expirationTime'].toString(), calculatedExpirationTime.toString(), "Transaction expiration time is not correct");
        });

        it("should create a new remittance with fees (nothing changes... until withdrawing)", async function() {

            let txObj = await instance.sendRemittance(hash, 5, {from: alice, value: quantityBig});

            // Check event
            let args = txObj.logs[0].args;
            assert.strictEqual(args['amount'].toString(), quantityBigBN.toString(), "Log amount is not correct");

            // Check if the remittance worked as expected
            let newBalanceBN = toBN(await web3.eth.getBalance(instance.address));
            assert.strictEqual(quantityBigBN.toString(), newBalanceBN.toString(), "Contract does not have the ether we sent.");
            let remittance = await instance.remittances.call(hash);
            assert.strictEqual(remittance['amount'].toString(), quantityBigBN.toString(), "Log amount is not correct");
        });

        it("should not let with wrong expiration date", async function() {
            await expectedExceptionPromise(async function() {
                return await instance.sendRemittance(hash, 0, {from: alice, value: quantity});
            });
            await expectedExceptionPromise(async function() {
                return await instance.sendRemittance(hash, maxExpirationSeconds + 1, {from: alice, value: quantity});
            });
        });

        it("should not let use the same password twice", async function() {
            await instance.sendRemittance(hash, 5, {from: alice, value: quantity});
            await expectedExceptionPromise(async function() {
                return await instance.sendRemittance(hash, 5, {from: bob, value: quantityBig});
            });
        });
    });

    describe("withdrawing remittance", function() {

        beforeEach("add remittances", async function() {

            await instance.sendRemittance(hash, 5, {from: alice, value: quantity});
            await instance.sendRemittance(hash2, 5, {from: alice, value: quantityBig});
        });

        it("should let carol withdraw the remittance", async function() {

            let carolInitialBalanceBN = toBN(await web3.eth.getBalance(carol));
            let txObj = await instance.withdraw(password, {from: carol});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log remittance id is not correct");
            assert.strictEqual(args['sender'], alice, "Log sender is not correct");
            assert.strictEqual(args['amount'].toString(), quantity, "Log amount is not correct");

            // Check new carol balance
            let remittanceCostBN = await getTransactionCost(txObj);
            let carolNewBalanceBN = toBN(await web3.eth.getBalance(carol));
            let newBalanceCalculation = carolInitialBalanceBN.sub(remittanceCostBN).add(quantityBN);
            assert.strictEqual(carolNewBalanceBN.toString(), newBalanceCalculation.toString(), "Carol did not receive the right amount of funds");
        });

        it("should withdraw a remittance minus the fees", async function () {

            let carolInitialBalanceBN = toBN(await web3.eth.getBalance(carol));
            let txObj = await instance.withdraw(password2, {from: carol});
            let args = txObj.logs[0].args;
            assert.strictEqual(args['amount'].toString(), quantityBigBN.sub(feeBN).toString(), "Log amount is not correct");

            // Check new carol balance
            let remittanceCostBN = await getTransactionCost(txObj);
            let carolNewBalanceBN = toBN(await web3.eth.getBalance(carol));
            let newBalanceCalculation = carolInitialBalanceBN.sub(remittanceCostBN).add(quantityBigBN).sub(feeBN);
            assert.strictEqual(carolNewBalanceBN.toString(), newBalanceCalculation.toString(), "Carol did not receive the right amount of funds");

            let benefitsToWithdraw = await instance.benefitsToWithdraw.call();
            assert.strictEqual(benefitsToWithdraw.toString(), feeBN.toString(), "Contract did not added up the benefits to withdraw");
        });

        it("should not let carol withdraw twice", async function() {

            await instance.withdraw(password, {from: carol});
            await expectedExceptionPromise(async function() {
                return await instance.withdraw(password, {from: carol});
            });
        });

        it("should not let any other party to withdraw the remittance", async function() {

            await expectedExceptionPromise(async function() {
                return await instance.withdraw(password, {from: bob});
            });
        });

        it("should not let carol withdraw with a wrong password", async function() {

            await expectedExceptionPromise(async function() {
                return await instance.withdraw("random", {from: carol});
            });
        });

        it("should not let withdraw past expiration time", async function() {
            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [24*3600 + 1], id: 0}, err => console.log);
            await expectedExceptionPromise(async function() {
                return await instance.withdraw(password, {from: carol});
            });
        });
    });

    describe("withdrawing after expiration date", function() {

        beforeEach("add remittances", async function() {

            await instance.sendRemittance(hash, 5, {from: alice, value: quantity});
        });

        it("should let withdraw to sender after expiration time", async function() {

            let aliceInitialBalanceBN = toBN(await web3.eth.getBalance(alice));
            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [2*3600*24], id: 0}, err => console.log);
            let txObj = await instance.cancelRemittance(hash, {from: alice});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            let args = txObj.logs[0].args;
            assert.strictEqual(args['hash'], hash, "Log remittance id is not correct");
            assert.strictEqual(args['sender'], alice, "Log sender is not correct");
            assert.strictEqual(args['amount'].toString(), quantity, "Log amount is not correct");

            // Check new alice balance
            let remittanceCostBN = await getTransactionCost(txObj);
            let aliceNewBalanceBN = toBN(await web3.eth.getBalance(alice));
            let newBalanceCalculation = aliceInitialBalanceBN.sub(remittanceCostBN).add(quantityBN);
            assert.strictEqual(aliceNewBalanceBN.toString(), newBalanceCalculation.toString(), "Carol did not receive the right amount of funds");
        });

        it("should not let withdraw to sender before expiration time", async function() {

            await expectedExceptionPromise(async function() {
                return await instance.cancelRemittance(hash, {from: alice});
            });
        });

        it("should only let withdraw alice past expiration time", async function() {

            await web3.currentProvider.send({jsonrpc: '2.0', method: 'evm_increaseTime', params: [6*24*3600], id: 0}, err => console.log);
            await expectedExceptionPromise(async function() {
                return await instance.cancelRemittance(hash, {from: bob});
            });
        });

    });

    describe("withdrawing the benefits", function() {

        let feesQtyBN;

        beforeEach("add fees", async function() {

            await instance.sendRemittance(hash, 5, {from: alice, value: quantityBig});
            await instance.withdraw(password, {from: carol});

            await instance.sendRemittance(hash2, 5, {from: alice, value: quantityBig});
            await instance.withdraw(password2, {from: carol});

            feesQtyBN = feeBN.mul(toBN("2"));
        });

        it("should withdraw the right amount benefits from the fees", async function() {

            let ownerInitialBalance = toBN(await web3.eth.getBalance(owner));
            let txObj = await instance.withdrawBenefits({from: owner});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            assert.strictEqual(txObj.logs[0].args['amount'].toString(), feesQtyBN.toString(), "Log amount is not correct");

            // Check new owner balance
            let remittanceCostBN = await getTransactionCost(txObj);
            let ownerNewBalanceBN = toBN(await web3.eth.getBalance(owner));
            let newBalanceCalculation = ownerInitialBalance.sub(remittanceCostBN).add(feesQtyBN);
            assert.strictEqual(ownerNewBalanceBN.toString(), newBalanceCalculation.toString(), "Owner did not receive the right amount");
        });

        it("should only let the owner to withdraw", async function() {

            await expectedExceptionPromise(async function() {
                return await instance.withdrawBenefits({from: carol});
            });
        });

        it("should not let withdraw the fees twice", async function() {

            await instance.withdrawBenefits({from: owner});
            await expectedExceptionPromise(async function() {
                return await instance.withdrawBenefits({from: owner});
            });
        });

        it("should not let withdraw the fees while remittance in flight", async function() {

            await instance.withdrawBenefits({from: owner});
            let hash3 = await instance.hashPasswords(carol, "another password");
            await instance.sendRemittance(hash3, 5, {from: alice, value: quantityBig});
            await expectedExceptionPromise(async function() {
                return await instance.withdrawBenefits({from: owner});
            });
        });
    });

    describe("exceptions when not able to send ETH", function() {

        it("should not let alice send ETH to the contract", async function() {

            return await expectedExceptionPromise(function() {
                return instance.sendTransaction({from: alice, value: quantity});
            });
        });

        it("should not let once the contract killSwitch has been activated", async function() {

            let txObj = await instance.kill({from: owner});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            await expectedExceptionPromise(function() {
                return instance.sendRemittance(hash, 5, {from: alice, value: quantity});
            });
        });

        it("should not let any other than owner to kill the contract", async function() {

            return await expectedExceptionPromise(function() {
                return instance.kill({from: alice});
            });
        });

        it("should not let send ETH while paused", async function() {

            let txObj = await instance.pause({from: owner});
            assert.strictEqual(txObj.logs.length, 1, "Only one event is expected");
            assert.strictEqual(txObj.logs[0].args['account'], owner, "Log account that paused not correct");
            let isPaused = await instance.isPaused();
            assert.strictEqual(isPaused, true, "Contract should be paused");
            await expectedExceptionPromise(function() {
                return instance.sendRemittance(hash, 5, {from: alice, value: quantity});
            });
            isPaused = await instance.isPaused();
            assert.strictEqual(isPaused, true, "Contract should not be paused");
        });

        it("should not let send ETH if starting paused", async function() {

            let instance2 = await Remittance.new(true, {from: owner});
            await expectedExceptionPromise(function() {
                return instance2.sendRemittance(hash, 5, {from: alice, value: quantity});
            });
        });
    });
});