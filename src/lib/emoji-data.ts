// Emojis du sélecteur, par catégorie, avec quelques mots-clés en français pour la recherche.
// Format : [emoji, "mots clés"]. Sélection volontairement courte : les plus utilisés.

export type EmojiCategory = { id: string; label: string; icon: string; emojis: [string, string][] };

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: "smileys",
    label: "Visages",
    icon: "😀",
    emojis: [
      ["😀", "sourire content joie"], ["😃", "sourire heureux"], ["😄", "rire joyeux"], ["😁", "sourire dents"],
      ["😆", "rire fou"], ["😅", "soulagement sueur rire"], ["😂", "mort de rire larmes mdr"], ["🤣", "rire par terre ptdr"],
      ["🙂", "sourire leger"], ["🙃", "renverse ironie"], ["😉", "clin doeil"], ["😊", "sourire joues rouges gentil"],
      ["😇", "ange innocent"], ["🥰", "amoureux coeurs adorer"], ["😍", "yeux coeurs amour"], ["🤩", "etoiles wahou"],
      ["😘", "bisou baiser"], ["😗", "bisou"], ["😋", "miam delicieux"], ["😜", "langue clin doeil"],
      ["🤪", "fou dingue"], ["😎", "lunettes cool"], ["🤓", "intello lunettes"], ["🥳", "fete anniversaire"],
      ["😏", "sournois malin"], ["😒", "bof ennuye"], ["😞", "decu triste"], ["😔", "pensif triste"],
      ["😟", "inquiet"], ["😕", "perplexe"], ["🙁", "triste"], ["😣", "souffrance"],
      ["😢", "pleurer larme triste"], ["😭", "sanglots pleurer fort"], ["😤", "colere vapeur"], ["😠", "fache colere"],
      ["😡", "tres en colere rage"], ["🤯", "tete explose choc"], ["😱", "peur cri horreur"], ["😨", "peur"],
      ["😰", "angoisse sueur"], ["🥵", "chaud"], ["🥶", "froid"], ["😳", "gene rougir"],
      ["🤔", "reflexion penser hum"], ["🤭", "oups main bouche"], ["🤫", "chut silence"], ["😶", "sans voix"],
      ["😐", "neutre"], ["😑", "impassible"], ["🙄", "yeux au ciel soupir"], ["😬", "grimace gene"],
      ["😴", "dormir fatigue sommeil"], ["😪", "somnolent"], ["🤤", "bave envie"], ["😷", "masque malade"],
      ["🤒", "malade fievre"], ["🤕", "blesse bandage"], ["🤢", "nausee degout"], ["🤮", "vomir"],
      ["🥺", "supplique yeux humides"], ["😈", "diable malicieux"], ["💀", "crane mort"], ["🤡", "clown"],
    ],
  },
  {
    id: "gestes",
    label: "Gestes",
    icon: "👍",
    emojis: [
      ["👍", "pouce oui ok bien"], ["👎", "pouce non pas bien"], ["👌", "parfait ok"], ["✌️", "victoire paix"],
      ["🤞", "doigts croises chance"], ["🤟", "je t aime"], ["🤘", "rock"], ["🤙", "appelle moi"],
      ["👈", "gauche"], ["👉", "droite"], ["👆", "haut"], ["👇", "bas"],
      ["☝️", "doigt haut"], ["✋", "main stop"], ["🖐️", "main ouverte"], ["👋", "salut coucou bonjour"],
      ["👏", "bravo applaudir"], ["🙌", "mains levees hourra"], ["👐", "mains ouvertes"], ["🤝", "poignee de main accord"],
      ["🙏", "merci priere svp"], ["💪", "muscle force"], ["✍️", "ecrire"], ["🤳", "selfie"],
      ["👀", "yeux regarder"], ["🧠", "cerveau"], ["🫶", "coeur mains"], ["🫡", "salut militaire"],
    ],
  },
  {
    id: "coeurs",
    label: "Cœurs",
    icon: "❤️",
    emojis: [
      ["❤️", "coeur rouge amour"], ["🧡", "coeur orange"], ["💛", "coeur jaune"], ["💚", "coeur vert"],
      ["💙", "coeur bleu"], ["💜", "coeur violet"], ["🖤", "coeur noir"], ["🤍", "coeur blanc"],
      ["🤎", "coeur marron"], ["💔", "coeur brise chagrin"], ["❣️", "coeur exclamation"], ["💕", "deux coeurs"],
      ["💞", "coeurs qui tournent"], ["💓", "coeur qui bat"], ["💗", "coeur grandissant"], ["💖", "coeur brillant"],
      ["💘", "coeur fleche cupidon"], ["💝", "coeur cadeau"], ["💯", "cent parfait"], ["🔥", "feu top"],
      ["✨", "etincelles brillant"], ["⭐", "etoile"], ["🌟", "etoile brillante"], ["💥", "explosion"],
    ],
  },
  {
    id: "animaux",
    label: "Animaux",
    icon: "🐶",
    emojis: [
      ["🐶", "chien"], ["🐱", "chat"], ["🐭", "souris"], ["🐰", "lapin"], ["🦊", "renard"], ["🐻", "ours"],
      ["🐼", "panda"], ["🐨", "koala"], ["🐯", "tigre"], ["🦁", "lion"], ["🐮", "vache"], ["🐷", "cochon"],
      ["🐸", "grenouille"], ["🐵", "singe"], ["🙈", "singe yeux caches"], ["🐔", "poule"], ["🐧", "pingouin"],
      ["🐦", "oiseau"], ["🦋", "papillon"], ["🐝", "abeille"], ["🐢", "tortue"], ["🐍", "serpent"],
      ["🐘", "elephant"], ["🦒", "girafe"], ["🐟", "poisson"], ["🐬", "dauphin"], ["🌸", "fleur cerisier"], ["🌹", "rose"],
      ["🌻", "tournesol"], ["🌴", "palmier"], ["🍀", "trefle chance"], ["🌍", "terre monde afrique"],
    ],
  },
  {
    id: "nourriture",
    label: "Nourriture",
    icon: "🍔",
    emojis: [
      ["🍎", "pomme"], ["🍌", "banane"], ["🍉", "pasteque"], ["🍇", "raisin"], ["🍓", "fraise"], ["🍍", "ananas"],
      ["🥭", "mangue"], ["🥑", "avocat"], ["🌽", "mais"], ["🥕", "carotte"], ["🍞", "pain"], ["🧀", "fromage"],
      ["🍳", "oeuf poele"], ["🍗", "poulet cuisse"], ["🍖", "viande"], ["🍔", "burger hamburger"], ["🍟", "frites"],
      ["🍕", "pizza"], ["🌮", "tacos"], ["🍝", "pates"], ["🍚", "riz"], ["🍲", "plat mijote ragout"],
      ["🍰", "gateau"], ["🎂", "anniversaire gateau"], ["🍫", "chocolat"], ["🍿", "popcorn pop corn"], ["🍺", "biere"],
      ["🥂", "trinquer champagne"], ["☕", "cafe"], ["🧃", "jus"], ["💧", "eau goutte"],
    ],
  },
  {
    id: "activites",
    label: "Activités",
    icon: "⚽",
    emojis: [
      ["⚽", "football foot"], ["🏀", "basket"], ["🏈", "rugby americain"], ["🎾", "tennis"], ["🏐", "volley"],
      ["🏓", "ping pong"], ["🥊", "boxe"], ["🏆", "trophee coupe victoire"], ["🥇", "medaille or premier"], ["🎯", "cible"],
      ["🎮", "jeu video manette"], ["🎲", "des jeu"], ["🎵", "musique note"], ["🎶", "musique notes"], ["🎤", "micro chanter"],
      ["🎧", "casque ecouteurs"], ["🎬", "cinema clap"], ["📸", "photo appareil"], ["🎉", "fete confettis"], ["🎊", "fete"],
      ["🎁", "cadeau"], ["🎈", "ballon"],
    ],
  },
  {
    id: "voyages",
    label: "Voyages",
    icon: "🚗",
    emojis: [
      ["🚗", "voiture"], ["🚕", "taxi"], ["🚌", "bus"], ["🏍️", "moto"], ["🛵", "scooter"], ["🚲", "velo"],
      ["✈️", "avion"], ["🚀", "fusee"], ["🚢", "bateau"], ["🚂", "train"], ["🏠", "maison"], ["🏢", "immeuble bureau"],
      ["🏥", "hopital"], ["🏫", "ecole"], ["⛪", "eglise"], ["🕌", "mosquee"], ["🌅", "lever de soleil"], ["🌙", "lune nuit"],
      ["☀️", "soleil"], ["🌧️", "pluie"], ["⛈️", "orage"], ["🌈", "arc en ciel"],
    ],
  },
  {
    id: "objets",
    label: "Objets",
    icon: "💡",
    emojis: [
      ["📱", "telephone portable"], ["☎️", "telephone fixe"], ["💻", "ordinateur"], ["⌨️", "clavier"], ["🖥️", "ecran"],
      ["🔋", "batterie"], ["💡", "idee ampoule"], ["🔑", "cle"], ["🔒", "cadenas ferme"], ["📚", "livres"],
      ["📝", "note ecrire"], ["📎", "trombone"], ["📅", "calendrier date"], ["⏰", "reveil heure"], ["💰", "argent sac"],
      ["💵", "billet dollar"], ["💳", "carte bancaire"], ["🎓", "diplome"], ["💼", "mallette travail"], ["🛒", "courses panier"],
      ["🧴", "produit"], ["📦", "colis paquet"],
    ],
  },
  {
    id: "symboles",
    label: "Symboles",
    icon: "✅",
    emojis: [
      ["✅", "valide coche ok"], ["❌", "croix non"], ["❓", "question"], ["❗", "exclamation"], ["‼️", "double exclamation"],
      ["⚠️", "attention"], ["🚫", "interdit"], ["➕", "plus"], ["➖", "moins"], ["➡️", "fleche droite"],
      ["⬅️", "fleche gauche"], ["⬆️", "fleche haut"], ["⬇️", "fleche bas"], ["🔄", "actualiser"], ["🔔", "cloche notification"],
      ["🔕", "silence"], ["💬", "bulle message"], ["💭", "pensee"], ["🆗", "ok"], ["🆕", "nouveau"],
      ["🔴", "rond rouge"], ["🟢", "rond vert"], ["🔵", "rond bleu"], ["🟡", "rond jaune"],
    ],
  },
];

/** Minuscules et sans accents : « Café » trouve « cafe » */
export const normalizeSearch = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
