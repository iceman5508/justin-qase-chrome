const fs = require('fs');
const crypto = require('crypto');

// Replace with the actual path to your generated .pem file
const pemFilePath = './justin-qase-chrome.pem'; 

try {
    const pemKey = fs.readFileSync(pemFilePath);
    
    // Extract the public key in DER format (SubjectPublicKeyInfo)
    const publicKey = crypto.createPublicKey(pemKey);
    const derBuffer = publicKey.export({ type: 'spki', format: 'der' });
    
    // Convert to Base64 for Chrome's manifest
    const manifestKey = derBuffer.toString('base64');
    
    console.log('\n✅ Successfully extracted public key!\n');
    console.log('Add the following line to your manifest.json:\n');
    console.log(`"key": "${manifestKey}"\n`);
} catch (err) {
    console.error('Error reading or parsing the PEM file:', err.message);
}