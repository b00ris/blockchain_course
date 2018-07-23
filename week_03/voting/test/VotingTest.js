'use strict';

import {assertBigNumberEqual} from "./helpers/asserts";

const voting = artifacts.require('Voting.sol');

contract('VotingTest', function(accounts) {

    it('test construction', async function() {
        //given
        let currect = now();
        const votingContract = await voting.new(currect, currect+2, currect+4);
    });

    it('test voting correct', async function() {
        //given
        let currect = now();
        const votingContract = await voting.new(currect, currect+2, currect+4);

        //when
        let secret = "asdfghjkl";
        let voteHash = await votingContract.getVote(1, secret);
        await votingContract.vote(voteHash, {from: accounts[1]});

        await sleep(2000);
        await votingContract.reveal(secret, {from: accounts[1]});

        //then
        await sleep(2000);

        let cons;
        let pros;
        [cons, pros] = await votingContract.calculate();
        assertBigNumberEqual(cons, 0);
        assertBigNumberEqual(pros, 1);
    });

    it('test voting. many votes', async function() {
        //given
        let currect = now();
        const votingContract = await voting.new(currect, currect+2, currect+4);

        //when
        let secret0 = "asdfghjkl";
        let voteHash = await votingContract.getVote(1, secret0);
        await votingContract.vote(voteHash, {from: accounts[0]});

        let secret1 = "asdfghjkl1";
        let voteHash1 = await votingContract.getVote(1, secret1);
        await votingContract.vote(voteHash1, {from: accounts[1]});

        await sleep(2000);
        await votingContract.reveal(secret0, {from: accounts[0]});
        await votingContract.reveal(secret1, {from: accounts[1]});

        //then
        await sleep(2000);

        let cons;
        let pros;
        [cons, pros] = await votingContract.calculate();
        assertBigNumberEqual(cons, 0);
        assertBigNumberEqual(pros, 2);
    });

    it('test voting. many votes. different votes', async function() {
        //given
        let currect = now();
        const votingContract = await voting.new(currect, currect+2, currect+4);

        //when
        let secret0 = "asdfghjkl";
        let voteHash = await votingContract.getVote(1, secret0);
        await votingContract.vote(voteHash, {from: accounts[0]});

        let secret1 = "asdfghjkl1";
        let voteHash1 = await votingContract.getVote(0, secret1);
        await votingContract.vote(voteHash1, {from: accounts[1]});

        await sleep(2000);
        await votingContract.reveal(secret0, {from: accounts[0]});
        await votingContract.reveal(secret1, {from: accounts[1]});

        //then
        await sleep(2000);

        let cons;
        let pros;
        [cons, pros] = await votingContract.calculate();
        assertBigNumberEqual(cons, 1);
        assertBigNumberEqual(pros, 1);
    });
});

const sleep = require('util').promisify(setTimeout);

function now() {
    return Math.floor(Date.now() / 1000);
}