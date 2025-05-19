// SPDX-License-Identifier: MIT
pragma solidity ^0.8.16;

contract WatermarkRegistry {
    struct Vendor {
        string modelId;
        string publicKey;
        bytes32 secretKey;
        bool registered;
    }

    mapping(address => Vendor) public vendors;

    // Event emitted on successful registration
    event VendorRegistered(address indexed vendor, string modelId, string publicKey, bytes32 secretKey);

    // Event emitted when a signature is generated
    event SignatureGenerated(address indexed vendor, uint256 timestamp, bytes32 signature);

    // Register vendor with modelId and publicKey
    function registerVendor(string calldata modelId, string calldata publicKey) external returns (bytes32) {
        require(!vendors[msg.sender].registered, "Vendor already registered");

        // Generate a pseudo-random secretKey (not cryptographically secure)
        bytes32 secretKey = keccak256(abi.encodePacked(msg.sender, block.timestamp, modelId, publicKey));

        vendors[msg.sender] = Vendor({
            modelId: modelId,
            publicKey: publicKey,
            secretKey: secretKey,
            registered: true
        });

        emit VendorRegistered(msg.sender, modelId, publicKey, secretKey);
        return secretKey;
    }

    // Generate signature by providing correct secretKey and timestamp
    function generateSignature(bytes32 providedSecretKey, uint256 timestamp) external view returns (bytes32) {
        require(vendors[msg.sender].registered, "Vendor not registered");
        require(vendors[msg.sender].secretKey == providedSecretKey, "Invalid secret key");

        // Simulate a signature (for demonstration purposes)
        bytes32 signature = keccak256(abi.encodePacked(msg.sender, timestamp, providedSecretKey));

        return signature;
    }

    // (Optional) Utility function to verify if an address is registered
    function isRegistered(address vendor) external view returns (bool) {
        return vendors[vendor].registered;
    }
}
