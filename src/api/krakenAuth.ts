/**
 * Kraken Authentication Utilities
 * Handles HMAC-SHA512 signing for authenticated API requests
 */

import { getKrakenConfig } from "./config";

/**
 * Generate a nonce for API requests
 * Kraken requires a unique, incrementing nonce for each request
 */
export const generateNonce = (): number => {
  return Date.now() * 1000;
};

/**
 * Convert a string to Uint8Array
 */
const stringToUint8Array = (str: string): Uint8Array => {
  return new TextEncoder().encode(str);
};

/**
 * Convert base64 string to Uint8Array
 */
const base64ToUint8Array = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

/**
 * Convert Uint8Array to base64 string
 */
const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Concatenate two Uint8Arrays
 */
const concatUint8Arrays = (a: Uint8Array, b: Uint8Array): Uint8Array => {
  const result = new Uint8Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
};

/**
 * Create SHA-256 hash using Web Crypto API
 */
const sha256 = async (data: Uint8Array): Promise<Uint8Array> => {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(hashBuffer);
};

/**
 * Create HMAC-SHA512 signature using Web Crypto API
 */
const hmacSha512 = async (
  key: Uint8Array,
  data: Uint8Array,
): Promise<Uint8Array> => {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    data.buffer as ArrayBuffer,
  );
  return new Uint8Array(signature);
};

/**
 * Generate the API-Sign header for Kraken REST API
 *
 * The signature is created by:
 * 1. SHA256(nonce + POST data)
 * 2. HMAC-SHA512 with API secret (base64 decoded) of: URI path + SHA256 result
 * 3. Base64 encode the result
 */
export const generateSignature = async (
  urlPath: string,
  postData: string,
  nonce: number,
): Promise<string> => {
  const config = getKrakenConfig();

  if (!config.apiSecret) {
    throw new Error("API secret is not configured");
  }

  // Decode the API secret from base64
  const secretKey = base64ToUint8Array(config.apiSecret);

  // Create SHA256 hash of nonce + post data
  const noncePostData = stringToUint8Array(nonce.toString() + postData);
  const sha256Hash = await sha256(noncePostData);

  // Create message: URI path + SHA256 hash
  const pathBytes = stringToUint8Array(urlPath);
  const message = concatUint8Arrays(pathBytes, sha256Hash);

  // Create HMAC-SHA512 signature
  const signature = await hmacSha512(secretKey, message);

  // Return base64 encoded signature
  return uint8ArrayToBase64(signature);
};

/**
 * Create headers for authenticated REST API requests
 */
export const createAuthHeaders = async (
  urlPath: string,
  postData: string,
  nonce: number,
): Promise<Headers> => {
  const config = getKrakenConfig();
  const signature = await generateSignature(urlPath, postData, nonce);

  const headers = new Headers();
  headers.set("API-Key", config.apiKey);
  headers.set("API-Sign", signature);
  headers.set("Content-Type", "application/x-www-form-urlencoded");

  return headers;
};

/**
 * Get WebSocket authentication token from Kraken REST API
 * This token is required for authenticated WebSocket connections
 */
export const getWebSocketToken = async (): Promise<string> => {
  const config = getKrakenConfig();
  const urlPath = "/0/private/GetWebSocketsToken";
  const nonce = generateNonce();
  const postData = `nonce=${nonce}`;

  const headers = await createAuthHeaders(urlPath, postData, nonce);

  const response = await fetch(`${config.restUrl}${urlPath}`, {
    method: "POST",
    headers,
    body: postData,
  });

  if (!response.ok) {
    throw new Error(`Failed to get WebSocket token: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.error && data.error.length > 0) {
    throw new Error(`Kraken API error: ${data.error.join(", ")}`);
  }

  if (!data.result?.token) {
    throw new Error("No token in response");
  }

  return data.result.token;
};

/**
 * Format POST data for API requests
 * Converts an object to URL-encoded form data
 */
export const formatPostData = (
  params: Record<string, string | number | boolean | undefined>,
): string => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  return searchParams.toString();
};
