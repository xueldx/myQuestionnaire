/**
 * Robust copy to clipboard utility
 * @param text The text to copy
 * @returns Promise<void>
 */
export const copyToClipboard = async (text: string): Promise<void> => {
  // Try modern navigator.clipboard first
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      console.error("navigator.clipboard.writeText failed:", err);
      // Fall through to fallback
    }
  }

  // Fallback to legacy document.execCommand('copy')
  const textArea = document.createElement("textarea");
  textArea.value = text;

  // Ensure textarea is not visible but part of the DOM
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);

  textArea.focus();
  textArea.select();

  return new Promise((resolve, reject) => {
    try {
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (successful) {
        resolve();
      } else {
        reject(new Error("document.execCommand('copy') failed"));
      }
    } catch (err) {
      document.body.removeChild(textArea);
      reject(err);
    }
  });
};
