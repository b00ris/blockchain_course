'use strict';
var CryptoJS = require("crypto-js");
var express = require("express");
var bodyParser = require('body-parser');
var WebSocket = require("ws");

var http_port = process.env.HTTP_PORT || 3001;
var p2p_port = process.env.P2P_PORT || 6001;
var initialPeers = process.env.PEERS ? process.env.PEERS.split(',') : [];

var calculateHashForBlock = (block) => {
    return calculateHash(block.index, block.previousHash, block.timestamp, block.data, block.difficulty, block.nonce);
};

var calculateHash = (index, previousHash, timestamp, data, difficulty, nonce) => {
    return CryptoJS.SHA256(index + previousHash + timestamp + data + difficulty + nonce).toString();
};

// can be used to calculate a difficulty
var difficulty = 10;
var throttle = Math.floor(Math.pow(10, difficulty));
var target = () => Math.floor(Math.pow(2, 64)/throttle);
var estimatedTime = 5*1000; // in milliseconds

var getGuess = (hash) => parseInt(hash.substring(0, 12), 16);

var mine = (newBlock, previousBlock) => {
    if (newBlock.index === 0) {
        // the genesis case
        newBlock.nonce = 0;
        newBlock.hash = calculateHashForBlock(newBlock);
        newBlock.difficulty = difficulty;
        return newBlock;
    }

    let nonce = 0;
    let blockTarget = target();
    let guess = blockTarget+1;
    let hash;

    let start  = new Date();
    let previousBlockStarted = new Date(previousBlock.timestamp * 1000);
    let timePassed = start.getTime() - previousBlockStarted.getTime();
    newBlock.difficulty = calculateDifficulty(timePassed);

    while (guess > blockTarget) {
        nonce++;
        newBlock.nonce = nonce;

        hash = calculateHashForBlock(newBlock);
        guess = getGuess(hash);
    }

    let end  = new Date();
    let miningTime = timePassed + end.getTime() - start.getTime();
    miningTime = Math.floor(miningTime/1000);
    console.log('Mining finished in', miningTime, 's. New difficulty:', difficulty);

    newBlock.hash = hash;
    return newBlock;
};

var calculateDifficulty = (miningTime) => {
    if (miningTime > estimatedTime) {
        // difficulty is too big, so we should decrease it
        let newDifficulty = difficulty-1;
        if (newDifficulty >= 1) {
             difficulty = newDifficulty;
        }
        return difficulty;
    }

    if (miningTime < estimatedTime) {
        // difficulty is too low, so we should increase it
        let newDifficulty = difficulty+1;
        if (newDifficulty <= 20) {
            difficulty = newDifficulty;
        }
    }

    return difficulty;
};

var checkNonce = (newBlock) => {
    if (newBlock.index === 0) {
        // the genesis case
        if (newBlock.nonce !== 0) {
            return false;
        }

        if (newBlock.hash !== calculateHashForBlock(newBlock)) {
            return false
        }

        return true;
    }

    let guess = getGuess(newBlock.hash);
    if (guess > target) {
        return false;
    }

    if (newBlock.hash !== calculateHashForBlock(newBlock)) {
        return false;
    }

    return true;
};

class Block {
    constructor(index = 0, data = "", previousBlock = null) {
        this.timestamp = new Date().getTime() / 1000;

        if (previousBlock) {
            this.previousHash = previousBlock.hash.toString();
        }

        this.hash = calculateHashForBlock(this);

        this.index = index;
        this.data = data;

        let block = mine(this, previousBlock);
        this.hash = block.hash;
        this.nonce = block.nonce;
        this.difficulty = block.difficulty;
    }
}

var getGenesisBlock = () => {
    return new Block(0, "my genesis block!!");
};

var blockchain = [getGenesisBlock()];

var getLatestBlock = () => blockchain[blockchain.length - 1];

var generateNextBlock = (blockData) => {
    var previousBlock = getLatestBlock();
    var nextIndex = previousBlock.index + 1;
    return new Block(nextIndex, blockData, previousBlock);
};

var sockets = [];
var MessageType = {
    QUERY_LATEST: 0,
    QUERY_ALL: 1,
    RESPONSE_BLOCKCHAIN: 2
};

var initHttpServer = () => {
    var app = express();
    app.use(bodyParser.json());

    app.get('/blocks', (req, res) => res.send(JSON.stringify(blockchain)));
    app.post('/mineBlock', (req, res) => {
        var newBlock = generateNextBlock(req.body.data);;
        addBlock(newBlock);
        broadcast(responseLatestMsg());
        console.log('block added: ' + JSON.stringify(newBlock) + "\n");
        res.send();
    });
    app.get('/peers', (req, res) => {
        res.send(sockets.map(s => s._socket.remoteAddress + ':' + s._socket.remotePort));
    });
    app.post('/addPeer', (req, res) => {
        connectToPeers([req.body.peer]);
        res.send();
    });
    app.listen(http_port, () => console.log('Listening http on port: ' + http_port));
};

var initP2PServer = () => {
    var server = new WebSocket.Server({port: p2p_port});
    server.on('connection', ws => initConnection(ws));
    console.log('listening websocket p2p port on: ' + p2p_port);
};

var initConnection = (ws) => {
    sockets.push(ws);
    initMessageHandler(ws);
    initErrorHandler(ws);
    write(ws, queryChainLengthMsg());
};

var initMessageHandler = (ws) => {
    ws.on('message', (data) => {
        var message = JSON.parse(data);
        console.log('Received message' + JSON.stringify(message));
        switch (message.type) {
            case MessageType.QUERY_LATEST:
                write(ws, responseLatestMsg());
                break;
            case MessageType.QUERY_ALL:
                write(ws, responseChainMsg());
                break;
            case MessageType.RESPONSE_BLOCKCHAIN:
                handleBlockchainResponse(message);
                break;
        }
    });
};

var initErrorHandler = (ws) => {
    var closeConnection = (ws) => {
        console.log('connection failed to peer: ' + ws.url);
        sockets.splice(sockets.indexOf(ws), 1);
    };
    ws.on('close', () => closeConnection(ws));
    ws.on('error', () => closeConnection(ws));
};

var addBlock = (newBlock) => {
    if (isValidNewBlock(newBlock, getLatestBlock())) {
        blockchain.push(newBlock);
        difficulty = newBlock.difficulty;
    }
};

var isValidNewBlock = (newBlock, previousBlock) => {
    if (previousBlock.index + 1 !== newBlock.index) {
        console.log('invalid index');
        return false;
    }

    if (previousBlock.hash !== newBlock.previousHash) {
        console.log('invalid the previous hash');
        return false;
    }

    if (previousBlock.difficulty < 0) {
        console.log('invalid difficulty');
        return false;
    }

    if (calculateHashForBlock(newBlock) !== newBlock.hash) {
        console.log(typeof (newBlock.hash) + ' ' + typeof calculateHashForBlock(newBlock));
        console.log('invalid hash: ' + calculateHashForBlock(newBlock) + ' ' + newBlock.hash);
        return false;
    }

    if (!checkNonce(newBlock)) {
        console.log('invalid nonce(guess): ' + getGuess(newBlock.hash) + ' ' + target);
        return false;
    }
    return true;
};

var connectToPeers = (newPeers) => {
    newPeers.forEach((peer) => {
        var ws = new WebSocket(peer);
        ws.on('open', () => initConnection(ws));
        ws.on('error', () => {
            console.log('connection failed')
        });
    });
};

var handleBlockchainResponse = (message) => {
    var receivedBlocks = JSON.parse(message.data).sort((b1, b2) => (b1.index - b2.index));
    var latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
    var latestBlockHeld = getLatestBlock();
    if (latestBlockReceived.index > latestBlockHeld.index) {
        console.log('blockchain possibly behind. We got: ' + latestBlockHeld.index + ' Peer got: ' + latestBlockReceived.index);
        if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
            console.log("We can append the received block to our chain");
            blockchain.push(latestBlockReceived);
            broadcast(responseLatestMsg());
        } else if (receivedBlocks.length === 1) {
            console.log("We have to query the chain from our peer");
            broadcast(queryAllMsg());
        } else {
            console.log("Received blockchain is longer than current blockchain");
            replaceChain(receivedBlocks);
        }
    } else {
        console.log('received blockchain is not longer than current blockchain. Do nothing');
    }
};

var replaceChain = (newBlocks) => {
    if (isValidChain(newBlocks) && newBlocks.length > blockchain.length) {
        console.log('Received blockchain is valid. Replacing current blockchain with received blockchain');
        blockchain = newBlocks;
        difficulty = newBlocks[newBlocks.length-1].difficulty;
        broadcast(responseLatestMsg());
    } else {
        console.log('Received blockchain invalid');
    }
};

var isValidChain = (blockchainToValidate) => {
    if (JSON.stringify(blockchainToValidate[0]) !== JSON.stringify(getGenesisBlock())) {
        return false;
    }

    var tempBlocks = [blockchainToValidate[0]];
    for (var i = 1; i < blockchainToValidate.length; i++) {
        if (isValidNewBlock(blockchainToValidate[i], tempBlocks[i - 1])) {
            tempBlocks.push(blockchainToValidate[i]);
        } else {
            return false;
        }
    }
    return true;
};


var queryChainLengthMsg = () => ({'type': MessageType.QUERY_LATEST});
var queryAllMsg = () => ({'type': MessageType.QUERY_ALL});
var responseChainMsg = () =>({
    'type': MessageType.RESPONSE_BLOCKCHAIN, 'data': JSON.stringify(blockchain)
});
var responseLatestMsg = () => ({
    'type': MessageType.RESPONSE_BLOCKCHAIN,
    'data': JSON.stringify([getLatestBlock()])
});

var write = (ws, message) => ws.send(JSON.stringify(message));
var broadcast = (message) => sockets.forEach(socket => write(socket, message));

connectToPeers(initialPeers);
initHttpServer();
initP2PServer();