// src/app/api/translate/route.ts

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Simple in-memory rate limiting by IP
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 20; // requests per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function getRateLimitKey(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  // Clean up expired entry if exists
  if (record && now > record.resetTime) {
    rateLimitMap.delete(ip);
  }

  const currentRecord = rateLimitMap.get(ip);

  if (!currentRecord) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (currentRecord.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  currentRecord.count++;
  return { allowed: true, remaining: RATE_LIMIT - currentRecord.count };
}

// Lazy cleanup: remove expired entries when map gets too large
function cleanupIfNeeded() {
  if (rateLimitMap.size > 1000) {
    const now = Date.now();
    for (const [ip, record] of rateLimitMap.entries()) {
      if (now > record.resetTime) {
        rateLimitMap.delete(ip);
      }
    }
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SUPPORTED_LANGUAGES = [
  "en", "tr", "de", "fr", "es", "it", "pt", "ru", 
  "ar", "zh", "ja", "ko", "nl", "pl", "sv"
];

export async function POST(req: NextRequest) {
  try {
    // Cleanup if map is getting large
    cleanupIfNeeded();

    // Rate limiting
    const ip = getRateLimitKey(req);
    const { allowed, remaining } = checkRateLimit(ip);

    if (!allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": "60" },
        }
      );
    }

    const body = await req.json();
    const { text, targetLanguage } = body;

    // Input validation
    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      );
    }

    if (text.length > 2000) {
      return NextResponse.json(
        { error: "Text too long (max 2000 characters)" },
        { status: 400 }
      );
    }

    if (!targetLanguage || !SUPPORTED_LANGUAGES.includes(targetLanguage)) {
      return NextResponse.json(
        { error: "Invalid target language" },
        { status: 400 }
      );
    }

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: `You are a translator. Translate the following text to ${targetLanguage}. Only respond with the translation, nothing else.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
    });

    const translatedText = response.choices[0]?.message?.content?.trim() || "";

    return NextResponse.json(
      { translatedText },
      {
        headers: {
          "X-RateLimit-Remaining": String(remaining),
        },
      }
    );
  } catch (error) {
    console.error("Translation error:", error);
    return NextResponse.json(
      { error: "Translation failed" },
      { status: 500 }
    );
  }
}