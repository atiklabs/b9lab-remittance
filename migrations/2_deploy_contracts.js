const Remittance = artifacts.require("Remittance");

module.exports = function(deployer) {
    return deployer.deploy(Remittance, false);
};
