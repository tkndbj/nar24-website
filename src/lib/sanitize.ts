// src/lib/sanitize.ts
// Production-grade input sanitization utilities for XSS prevention and input validation

import sanitizeHtml from "sanitize-html";

// =============================================================================
// XSS SANITIZATION
// =============================================================================

/**
 * Sanitizes user input to prevent XSS attacks.
 * Removes all HTML tags and dangerous content.
 * Use this for plain text fields like names, reviews, questions, etc.
 */
export function sanitizeText(input: string | undefined | null): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  // Strip all HTML tags, keeping only text content
  const stripped = sanitizeHtml(input, {
    allowedTags: [], // No HTML tags allowed
    allowedAttributes: {}, // No attributes allowed
    disallowedTagsMode: "discard",
  });

  // Additional encoding for edge cases
  return stripped
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/`/g, "&#x60;")
    .trim();
}

/**
 * Sanitizes user input while preserving basic formatting.
 * Allows only safe HTML tags (bold, italic, line breaks).
 * Use this for rich text fields where basic formatting is needed.
 */
export function sanitizeRichText(input: string | undefined | null): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return sanitizeHtml(input, {
    allowedTags: ["b", "i", "em", "strong", "br", "p"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();
}

/**
 * Sanitizes input intended for display in HTML attributes.
 * Extra strict - encodes all special characters.
 */
export function sanitizeAttribute(input: string | undefined | null): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/`/g, "&#x60;")
    .replace(/\\/g, "&#x5C;")
    .trim();
}

// =============================================================================
// INPUT VALIDATION
// =============================================================================

/**
 * Validates and sanitizes an email address.
 * Returns sanitized email or null if invalid.
 */
export function validateEmail(email: string | undefined | null): string | null {
  if (!email || typeof email !== "string") {
    return null;
  }

  const sanitized = email.trim().toLowerCase();

  // RFC 5322 compliant email regex (simplified but robust)
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

  if (!emailRegex.test(sanitized)) {
    return null;
  }

  // Additional length check
  if (sanitized.length > 254) {
    return null;
  }

  return sanitized;
}

/**
 * Validates and sanitizes a URL.
 * Returns sanitized URL or null if invalid.
 * Only allows http and https protocols.
 */
export function validateUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string") {
    return null;
  }

  const trimmed = url.trim();

  try {
    const parsed = new URL(trimmed);

    // Only allow http and https
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }

    // Block javascript: protocol injection attempts
    if (trimmed.toLowerCase().includes("javascript:")) {
      return null;
    }

    // Block data: URIs
    if (trimmed.toLowerCase().includes("data:")) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Validates an array of URLs (e.g., for image galleries).
 * Returns array of valid URLs only.
 */
export function validateUrlArray(urls: unknown): string[] {
  if (!Array.isArray(urls)) {
    return [];
  }

  return urls
    .map((url) => validateUrl(url as string))
    .filter((url): url is string => url !== null);
}

/**
 * Validates a phone number.
 * Returns sanitized phone or null if invalid.
 * Allows digits, spaces, dashes, parentheses, and + prefix.
 */
export function validatePhone(phone: string | undefined | null): string | null {
  if (!phone || typeof phone !== "string") {
    return null;
  }

  // Remove all whitespace first
  const cleaned = phone.replace(/\s+/g, "");

  // Allow: +, digits, dashes, parentheses
  const phoneRegex = /^\+?[\d\-()]{7,20}$/;

  if (!phoneRegex.test(cleaned)) {
    return null;
  }

  // Extract only the essential parts for storage
  const digitsOnly = cleaned.replace(/[^\d+]/g, "");

  if (digitsOnly.length < 7 || digitsOnly.length > 20) {
    return null;
  }

  return cleaned;
}

// =============================================================================
// LENGTH VALIDATION
// =============================================================================

interface LengthOptions {
  minLength?: number;
  maxLength: number;
  truncate?: boolean; // If true, truncate instead of rejecting
}

/**
 * Validates string length and optionally truncates.
 * Returns validated string or null if invalid.
 */
export function validateLength(
  input: string | undefined | null,
  options: LengthOptions
): string | null {
  if (!input || typeof input !== "string") {
    return null;
  }

  const { minLength = 0, maxLength, truncate = false } = options;

  if (input.length < minLength) {
    return null;
  }

  if (input.length > maxLength) {
    if (truncate) {
      return input.substring(0, maxLength);
    }
    return null;
  }

  return input;
}

// =============================================================================
// COMBINED SANITIZATION FUNCTIONS (CONVENIENCE)
// =============================================================================

/**
 * Sanitizes and validates a user review.
 * - Strips XSS
 * - Enforces length limits
 * - Returns sanitized text or null if invalid
 */
export function sanitizeReview(
  review: string | undefined | null,
  maxLength: number = 5000
): string | null {
  if (!review || typeof review !== "string") {
    return null;
  }

  const sanitized = sanitizeText(review);

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length > maxLength) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitizes and validates a question.
 * - Strips XSS
 * - Enforces length limits (default 150 chars as per existing validation)
 */
export function sanitizeQuestion(
  question: string | undefined | null,
  maxLength: number = 150
): string | null {
  if (!question || typeof question !== "string") {
    return null;
  }

  const sanitized = sanitizeText(question);

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length > maxLength) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitizes a username/display name.
 * - Strips XSS
 * - Removes excessive whitespace
 * - Enforces reasonable length
 */
export function sanitizeUsername(
  name: string | undefined | null,
  maxLength: number = 100
): string {
  if (!name || typeof name !== "string") {
    return "Anonymous";
  }

  const sanitized = sanitizeText(name)
    .replace(/\s+/g, " ") // Collapse multiple spaces
    .trim();

  if (sanitized.length === 0) {
    return "Anonymous";
  }

  if (sanitized.length > maxLength) {
    return sanitized.substring(0, maxLength);
  }

  return sanitized;
}

/**
 * Sanitizes a shop name or business name.
 * - Strips XSS
 * - Allows some special characters common in business names
 */
export function sanitizeBusinessName(
  name: string | undefined | null,
  maxLength: number = 200
): string | null {
  if (!name || typeof name !== "string") {
    return null;
  }

  const sanitized = sanitizeText(name)
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length > maxLength) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitizes an address field.
 */
export function sanitizeAddress(
  address: string | undefined | null,
  maxLength: number = 500
): string | null {
  if (!address || typeof address !== "string") {
    return null;
  }

  const sanitized = sanitizeText(address)
    .replace(/\s+/g, " ")
    .trim();

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length > maxLength) {
    return null;
  }

  return sanitized;
}

// =============================================================================
// NUMERIC VALIDATION
// =============================================================================

/**
 * Validates a rating value.
 * Returns the rating if valid (1-5), null otherwise.
 */
export function validateRating(rating: unknown): number | null {
  const num = typeof rating === "string" ? parseFloat(rating) : rating;

  if (typeof num !== "number" || isNaN(num)) {
    return null;
  }

  if (num < 1 || num > 5) {
    return null;
  }

  // Round to nearest 0.5 for half-star ratings
  return Math.round(num * 2) / 2;
}

/**
 * Validates a positive integer (e.g., for IDs, counts).
 */
export function validatePositiveInt(value: unknown): number | null {
  const num = typeof value === "string" ? parseInt(value, 10) : value;

  if (typeof num !== "number" || isNaN(num)) {
    return null;
  }

  if (!Number.isInteger(num) || num < 0) {
    return null;
  }

  return num;
}

// =============================================================================
// OBJECT SANITIZATION
// =============================================================================

/**
 * Sanitizes a review submission object.
 * Returns sanitized data or throws an error with validation message.
 */
export interface ReviewInput {
  userId: string;
  userName?: string;
  userImage?: string;
  rating: number;
  review: string;
  imageUrls?: string[];
  verified?: boolean;
}

export interface SanitizedReview {
  userId: string;
  userName: string;
  userImage: string | null;
  rating: number;
  review: string;
  imageUrls: string[];
  verified: boolean;
}

export function sanitizeReviewInput(input: Partial<ReviewInput>): SanitizedReview {
  const userId = sanitizeText(input.userId);
  if (!userId) {
    throw new Error("User ID is required");
  }

  const rating = validateRating(input.rating);
  if (rating === null) {
    throw new Error("Rating must be between 1 and 5");
  }

  const review = sanitizeReview(input.review);
  if (!review) {
    throw new Error("Review text is required (max 5000 characters)");
  }

  const userImage = input.userImage ? validateUrl(input.userImage) : null;
  const imageUrls = validateUrlArray(input.imageUrls);

  return {
    userId,
    userName: sanitizeUsername(input.userName),
    userImage,
    rating,
    review,
    imageUrls,
    verified: input.verified === true,
  };
}

/**
 * Sanitizes a question submission object.
 */
export interface QuestionInput {
  sellerId: string;
  isShop: boolean;
  questionText: string;
  askerNameVisible?: boolean;
}

export interface SanitizedQuestion {
  sellerId: string;
  isShop: boolean;
  questionText: string;
  askerNameVisible: boolean;
}

export function sanitizeQuestionInput(input: Partial<QuestionInput>): SanitizedQuestion {
  const sellerId = sanitizeText(input.sellerId);
  if (!sellerId) {
    throw new Error("Seller ID is required");
  }

  if (typeof input.isShop !== "boolean") {
    throw new Error("isShop flag is required");
  }

  const questionText = sanitizeQuestion(input.questionText);
  if (!questionText) {
    throw new Error("Question text is required (max 150 characters)");
  }

  return {
    sellerId,
    isShop: input.isShop,
    questionText,
    askerNameVisible: input.askerNameVisible === true,
  };
}

/**
 * Sanitizes shop application data.
 */
export interface ShopApplicationInput {
  name: string;
  email: string;
  contactNo: string;
  address: string;
}

export interface SanitizedShopApplication {
  name: string;
  email: string;
  contactNo: string;
  address: string;
}

export function sanitizeShopApplication(
  input: Partial<ShopApplicationInput>
): SanitizedShopApplication {
  const name = sanitizeBusinessName(input.name);
  if (!name) {
    throw new Error("Shop name is required (max 200 characters)");
  }

  const email = validateEmail(input.email);
  if (!email) {
    throw new Error("Valid email address is required");
  }

  const contactNo = validatePhone(input.contactNo);
  if (!contactNo) {
    throw new Error("Valid contact number is required");
  }

  const address = sanitizeAddress(input.address);
  if (!address) {
    throw new Error("Address is required (max 500 characters)");
  }

  return {
    name,
    email,
    contactNo,
    address,
  };
}

// =============================================================================
// TRANSLATION INPUT SANITIZATION
// =============================================================================

/**
 * Sanitizes text for translation.
 * Less aggressive than other sanitization - preserves content but removes scripts.
 */
export function sanitizeForTranslation(
  text: string | undefined | null,
  maxLength: number = 2000
): string | null {
  if (!text || typeof text !== "string") {
    return null;
  }

  // Remove script tags and dangerous content but preserve most text
  const sanitized = sanitizeHtml(text, {
    allowedTags: [], // Strip all tags
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim();

  if (sanitized.length === 0) {
    return null;
  }

  if (sanitized.length > maxLength) {
    return null;
  }

  return sanitized;
}
