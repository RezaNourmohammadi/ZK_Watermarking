
include "circuits/poseidon.circom";

template SignatureProof() {
    // Public Inputs
    signal input timestamp;
    signal input expectedHash;

    // Private Input
    signal input secretKey;

    // Intermediate: computed hash
    signal output computedHash;

    component poseidon = Poseidon(2);

    poseidon.inputs[0] <== secretKey;
    poseidon.inputs[1] <== timestamp;

    computedHash <== poseidon.out;

    // Constrain the computed hash to match expected public hash
    expectedHash === computedHash;
}

component main = SignatureProof();
