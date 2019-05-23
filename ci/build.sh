#!/usr/bin/env sh

set -x
set -e
ganache-cli --accounts=10 -l 0xfffffffffff -g 0x01 -e 4200 -m "dream feel bract hill river gate farm naive paddle script destroy word" > /dev/null &
TESTRPC_PID=$!
trap "kill $TESTRPC_PID" EXIT INT TERM

truffle compile
truffle migrate
truffle test
