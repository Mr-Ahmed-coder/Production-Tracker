export const habitTitleKey = (title) =>
  title.trim().replace(/\s+/gu, " ").toLowerCase().normalize("NFC");
