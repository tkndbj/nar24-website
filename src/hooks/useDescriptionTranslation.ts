"use client";

import { useState, useCallback, useEffect } from "react";
import { User } from "firebase/auth";
import translationService, {
  RateLimitException,
  TranslationException,
} from "@/services/translation_service";

interface DescriptionTranslationResult {
  isTranslated: boolean;
  translatedText: string;
  isTranslating: boolean;
  translationError: string | null;
  handleToggleTranslation: () => void;
}

export function useDescriptionTranslation(
  description: string | undefined,
  locale: string,
  user: User | null,
  t: (key: string) => string
): DescriptionTranslationResult {
  const [isTranslated, setIsTranslated] = useState(false);
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Set up translation service with current user
  useEffect(() => {
    translationService.setUser(user);
  }, [user]);

  // Reset when description changes
  useEffect(() => {
    setIsTranslated(false);
    setTranslatedText("");
    setTranslationError(null);
    setIsTranslating(false);
  }, [description]);

  const handleToggleTranslation = useCallback(async () => {
    if (isTranslating || !description) return;

    if (isTranslated) {
      setIsTranslated(false);
      setTranslationError(null);
      return;
    }

    if (translatedText) {
      setIsTranslated(true);
      setTranslationError(null);
      return;
    }

    if (!user) {
      setTranslationError(t("loginRequired"));
      return;
    }

    setIsTranslating(true);
    setTranslationError(null);

    try {
      const translation = await translationService.translate(
        description,
        locale
      );

      if (translation) {
        setTranslatedText(translation);
        setIsTranslated(true);
      } else {
        setTranslationError(t("translationFailed"));
      }
    } catch (error) {
      if (error instanceof RateLimitException) {
        setTranslationError(t("rateLimitExceeded"));
      } else if (error instanceof TranslationException) {
        setTranslationError(error.message || t("translationFailed"));
      } else {
        setTranslationError(t("translationFailed"));
      }
    } finally {
      setIsTranslating(false);
    }
  }, [description, isTranslating, isTranslated, translatedText, t, user, locale]);

  return {
    isTranslated,
    translatedText,
    isTranslating,
    translationError,
    handleToggleTranslation,
  };
}
