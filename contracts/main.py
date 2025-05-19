from web3 import Web3
import json  
import time
import subprocess
import numpy as np


contract_address = "0xcDB288C0c937560d8A62AF00C91CB8Aa73c7dBcc"
verifier_contract_address = "0x72c83ec0BeBCf10aAfA97BeAe9B1FA2C80cD8760"

ganache_url = "http://127.0.0.1:8545"
web3Connection = Web3(Web3.HTTPProvider(ganache_url))
assert web3Connection.is_connected(), "Failed to connect to Ganache"

print(web3Connection.is_connected())

with open('contracts/sig_gen_ABI.json') as f:
    ##self.FLcontractABI=json.load(f)["abi"]
    sig_gen_contractABI = json.load(f)
    
with open('contracts/verifier_abi.json') as f:
    ##self.FLcontractABI=json.load(f)["abi"]
    verifier_abi = json.load(f)
    
sig_gen_contract = web3Connection.eth.contract(address=contract_address,abi=sig_gen_contractABI)
verify_contract = web3Connection.eth.contract(address=verifier_contract_address,abi=verifier_abi)


model_id = "my-llm-model-1"
public_key = "some-public-key-as-string"


account = web3Connection.eth.accounts[0]
# Estimate gas & build transaction
# tx = sig_gen_contract.functions.registerVendor(model_id, public_key).build_transaction({
#     'from': account,
#     'gas': 3000000,
#     'gasPrice': web3Connection.to_wei('20', 'gwei'),
#     'nonce': web3Connection.eth.get_transaction_count(account),
# })

# # Sign and send transaction (no private key needed if unlocked in Ganache)
# tx_hash = web3Connection.eth.send_transaction(tx)

# # Wait for confirmation
# receipt = web3Connection.eth.wait_for_transaction_receipt(tx_hash)
# print("Transaction receipt:", receipt)
secret_key = "e84a69e42291597748f39c77947efe6f41bbf78732b01afa2fc87db0c7bbe3f9" 
secret_key = bytes.fromhex(secret_key)  # remove 0x if present

signature_generation_time = []
proof_generation_time = []
gas_used_list = []

for i in range(5):

    timestamp = int(time.time())

    t1 = time.time()

    signature= sig_gen_contract.functions.generateSignature(secret_key, timestamp).call(
                    {"from": account})

    t2 = time.time()
    
    signature_generation_time.append(t2-t1)
    print(signature.hex())
    print()
    # ------------------------------------
    # STEP 1: Create input.json for Circom
    # ------------------------------------
    input_data = {
        "secretKey": int.from_bytes(secret_key, byteorder='big'),
        "timestamp": timestamp,
        "expectedHash": int(signature.hex(), 16)
    }
    with open(f"input.json", "w") as f:
        json.dump(input_data, f)

    # ------------------------------------
    # STEP 2: Generate witness using snarkjs
    # ------------------------------------
    t3 = time.time()
    subprocess.run([
        "snarkjs", "wtns", "calculate",
        "signature_proof.wasm", "input.json", "witness.wtns"
    ])
    print("Witness generated as witness.wtns")
    print()

    # ------------------------------------
    # STEP 3: Generate proof using snarkjs
    # ------------------------------------
    proof_generation = subprocess.run([
        "snarkjs", "groth16", "prove",
        "signature_proof_0000.zkey", "witness.wtns",
        f"proof_{i}.json", f"public_{i}.json"
    ], capture_output=True, text=True)

    t4 = time.time()
    proof_generation_time.append(t4-t3)
    if proof_generation.returncode == 0:
        print("Proof generated successfully.")
    else:
        print("Error during proof generation:")
        print(proof_generation.stderr)

    with open("proof.json") as f:
        proof = json.load(f)
    with open("public.json") as f:
        public_signals = json.load(f)

    print("Proof:", proof)
    print("Public inputs:", public_signals)
    
    a = [int(proof["pi_a"][0]), int(proof["pi_a"][1])]
    b = [
        [int(proof["pi_b"][0][0]), int(proof["pi_b"][0][1])],
        [int(proof["pi_b"][1][0]), int(proof["pi_b"][1][1])]
    ]
    c = [int(proof["pi_c"][0]), int(proof["pi_c"][1])]
    input_values = []
    for input in public_signals:
        input_values.append(int(input))
    # Build transaction dict
    print('input_values: ', input_values)
    tx = verify_contract.functions.verifyProof(a, b, c, input_values).build_transaction({
        'from': account,
        'nonce': web3Connection.eth.get_transaction_count(account),
        'gas': 5000000,
        'gasPrice': web3Connection.to_wei('10', 'gwei')
    })

    signed_tx = web3Connection.eth.account.sign_transaction(tx, private_key="0xc4d138b0e5645d4264ea41a63237083f13a8c4426180d6838c06a9922b7f66d1")
    tx_hash = web3Connection.eth.send_raw_transaction(signed_tx.rawTransaction)

    receipt = web3Connection.eth.wait_for_transaction_receipt(tx_hash)
    print("Gas used:", receipt["gasUsed"])
    gas_used_list.append(receipt["gasUsed"])
    
print("average signature generation time: ", np.mean(signature_generation_time))
print("average proof generation time: ", np.mean(proof_generation_time))
print('average gas used: ', np.mean(gas_used_list))



    