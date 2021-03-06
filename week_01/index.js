const crypto = require('crypto');
const secp256k1 = require('secp256k1');

const msg = process.argv[2];
const digested = digest(msg);
const digestedHex = digestHex(msg);

function digest(str, algo = "sha256") {
        return crypto.createHash(algo).update(str).digest();
}

function digestHex(str, algo = "sha256") {
        return digest(str, algo).toString("hex");
}

console.log(`0) Alice's message: 
	message: ${msg}
	message digest: ${digestedHex}`);


// generate privateKey
let privateKey;
do {
	privateKey = crypto.randomBytes(32);
} while (!secp256k1.privateKeyVerify(privateKey));

// get the public key in a compressed format
const publicKey = secp256k1.publicKeyCreate(privateKey);
console.log(`1) Alice aquired new keypair:
	publicKey: ${publicKey.toString("hex")}
	privateKey: ${privateKey.toString("hex")}`);

/*
 Sign the message
*/
console.log(`2) Alice signed her message digest with her privateKey to get its signature:`);
const sigObj = secp256k1.sign(digested, privateKey);
const sig = sigObj.signature;
console.log("	Signature:", sig.toString("hex"));

/*
 Verify
*/
console.log(`3) Bob verifyed by 3 elements ("message digest", "signature", and Alice's "publicKey"):`);
let verified = secp256k1.verify(digested, sig, publicKey);
console.log("	verified:", verified);


/*
 Lets change the message
*/
console.log(`4) Bob tryed to verify a hacked message with the signature:`);
var digestedHacked = digest(msg.slice(0, -1));
verified = secp256k1.verify(digestedHacked, sig, publicKey);
console.log("        verified:", verified);


var h = crypto.createHash('sha256').update('Apple').digest("hex");
console.log("\nYet another hash", h);

