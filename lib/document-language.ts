"use client";

import { useEffect } from "react";

// The page is served as <html lang="en">; when a student switches to Chinese, say so on the document too,
// so screen readers read it in Chinese and browsers stop offering to translate it.
export function useDocumentLanguage(language: "en" | "zh") {
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
}
