# Zero-Knowledge Signature Verification System

This project implements a zero-knowledge proof system for signature verification using Circom and Ethereum smart contracts.

## Prerequisites

- Python 3.x
- Node.js and npm
- Ganache (local Ethereum blockchain)
- snarkjs
- Web3.py

## Setup

1. Install dependencies:
```bash
pip install web3 numpy
npm install -g snarkjs
```

2. Start Ganache on localhost:8545

3. Deploy the smart contracts:
- `Verifier.sol`
- Signature generation contract (ABI in `contracts/sig_gen_ABI.json`)

## Running the Project

1. Ensure Ganache is running
2. Update contract addresses in `main.py` if needed
3. Run the main script:
```bash
python main.py
```

The script will:
- Generate signatures
- Create zero-knowledge proofs
- Verify proofs on-chain
- Measure performance metrics (signature generation time, proof generation time, gas usage)

## Project Structure

- `main.py`: Main execution script
- `circuits/`: Contains Circom circuit definitions
- `contracts/`: Smart contract ABIs and source code
- `*.json`: Proof and public input files
- `*.zkey`: Zero-knowledge proof keys
- `*.ptau`: Powers of Tau ceremony files 