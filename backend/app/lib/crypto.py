import os
import base64
import hashlib
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import settings

def get_key() -> bytes:
    return bytes.fromhex(settings.ENCRYPTION_KEY)

def seal(plaintext: str) -> dict:
    key = get_key()
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    ciphertext_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    
    # Extract tag (last 16 bytes) and cipher (rest) to match Node.js separate fields
    tag = ciphertext_with_tag[-16:]
    cipher = ciphertext_with_tag[:-16]
    
    return {
        "cipher": base64.b64encode(cipher).decode("utf-8"),
        "iv": base64.b64encode(iv).decode("utf-8"),
        "tag": base64.b64encode(tag).decode("utf-8"),
    }

def open_secret(cipher: str, iv: str, tag: str) -> str:
    key = get_key()
    aesgcm = AESGCM(key)
    cipher_bytes = base64.b64decode(cipher)
    iv_bytes = base64.b64decode(iv)
    tag_bytes = base64.b64decode(tag)
    
    # Combine cipher and tag for cryptography's AESGCM decryption
    ciphertext_with_tag = cipher_bytes + tag_bytes
    decrypted = aesgcm.decrypt(iv_bytes, ciphertext_with_tag, None)
    return decrypted.decode("utf-8")

def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
