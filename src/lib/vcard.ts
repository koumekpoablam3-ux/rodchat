// Lecture d'un fichier de contacts vCard (.vcf), le format d'export de presque tous les carnets d'adresses
// (Android, iPhone, Google Contacts…). Ne lit que le nom et les numéros ; tout se passe dans le navigateur.

export type ParsedContact = { name: string; phones: string[] };

export function parseVCard(text: string): ParsedContact[] {
  // Les lignes longues sont « repliées » : une ligne qui commence par un espace continue la précédente
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const contacts: ParsedContact[] = [];
  let current: ParsedContact | null = null;
  let structuredName = "";

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:VCARD")) {
      current = { name: "", phones: [] };
      structuredName = "";
    } else if (upper.startsWith("END:VCARD")) {
      if (current && current.phones.length > 0) {
        contacts.push({ ...current, name: current.name || structuredName || "Sans nom" });
      }
      current = null;
    } else if (current) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      // « item1.TEL;TYPE=CELL » → « TEL »
      const key = line.slice(0, colon).split(";")[0].split(".").pop()?.toUpperCase() ?? "";
      const value = line.slice(colon + 1).trim();
      if (key === "FN" && value) current.name = value;
      else if (key === "N" && value) structuredName = value.split(";").filter(Boolean).reverse().join(" ").trim();
      else if (key === "TEL" && value) current.phones.push(value);
    }
  }
  return contacts;
}
