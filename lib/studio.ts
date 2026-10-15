/** Digits only, with the country code and no plus. Used until the admin panel has a number. */
export const studioWhatsApp = "";

export function whatsappHrefFor(number: string, text: string) {
  const digits = number.replace(/\D/g, "");
  return digits
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : "";
}
