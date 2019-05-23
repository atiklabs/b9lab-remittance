module.exports = {
    entry: "./app/js/remittance.js",
    output: {
        path: __dirname + "/build/app/js",
        filename: "remittance.js",
        libraryTarget: 'var',
        library: 'remittance'
    },
    module: {
        rules: [],
    },
    watch: true
};