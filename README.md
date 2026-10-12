# Rodchat

Messagerie instantanée en PWA : discussions privées et groupes, photos, fichiers, messages vocaux, appels audio et vidéo, installable sur téléphone.

**Stack** : Next.js 14 (App Router) · WebRTC · Prisma · PostgreSQL (Neon) · Tailwind CSS.
Hébergement : **Vercel + Neon, et rien d'autre**. Pas de serveur WebSocket : le temps réel passe par un flux SSE servi par Vercel et une file d'événements dans Neon (voir « Comment marche le temps réel »).

## Démarrage

```bash
npm install
cp .env.example .env      # puis remplis DATABASE_URL, DIRECT_URL et AUTH_SECRET
npx prisma db push        # crée les tables sur Neon
npm run dev               # http://localhost:3000 (Next.js seul, le temps réel marche aussi en local)
```

- `DATABASE_URL` : chaîne Neon **poolée** (hôte avec `-pooler`).
- `DIRECT_URL` : chaîne Neon **directe** (sans `-pooler`), utilisée par `db push`.
- `AUTH_SECRET` : `openssl rand -base64 32`.

Crée deux comptes (deux navigateurs, ou un en navigation privée), cherche l'autre par son nom et discute.

## Tester la PWA

Le service worker est actif en production uniquement :

```bash
npm run build
npm start
```

Ouvre l'app dans Chrome : l'option « Installer l'application » apparaît dans le menu (⋮) de la liste de discussions.
Pour tester en développement : ajoute `NEXT_PUBLIC_ENABLE_SW="true"` au `.env`.

Test sur téléphone en `http://` (réseau local) : ajoute `COOKIE_SECURE="false"`. L'installation PWA et les notifications exigent HTTPS (sauf `localhost`).

## Fichiers, vocaux et appels

**Stockage : uniquement PostgreSQL.** Les photos, vidéos, documents et messages vocaux sont enregistrés dans la table `Attachment` (colonne `bytea`). Aucun service externe. La table est séparée de `Message` : lire une discussion ne charge jamais les octets, seulement le nom, le type et la taille.

- Les photos sont réduites dans le navigateur avant l'envoi (1600 px, JPEG) pour ménager la base.
- Taille maximale par fichier : 10 Mo (`NEXT_PUBLIC_MAX_UPLOAD_MB`). Sur l'offre gratuite de Neon (0,5 Go), surveille l'espace utilisé dans le tableau de bord Neon.
- Un fichier n'est lisible que par les membres de la discussion. Les documents sont toujours téléchargés, jamais exécutés dans le navigateur.
- Vocaux : appuie sur le micro pour enregistrer, puis sur la flèche pour envoyer (10 minutes maximum).

**Blocage.** Dans « Infos du contact », *Bloquer* empêche toute nouvelle écriture et tout appel entre vous deux. La personne bloquée voit seulement « Tu ne peux pas écrire à cette personne » (on ne lui dit jamais qu'elle est bloquée) ; toi, tu vois un bandeau *Débloquer* à la place de la zone de saisie. Les anciens messages restent.

**Mentions.** Dans un groupe, taper `@` propose les membres ; le message cite `@pseudo`. La personne citée reçoit une notification **même si le groupe est en sourdine**, et sa mention ressort dans le texte.

**Appels audio et vidéo (WebRTC).** Le son et l'image passent directement d'un appareil à l'autre : rien n'est stocké. Le serveur ne fait que mettre les deux appareils en relation (signalisation). Seul le résultat de l'appel (durée, manqué, refusé) est enregistré dans la table `Call` et affiché dans la discussion.

- Appels audio et vidéo dans les discussions à deux, et **appels de groupe** (voir plus bas).
- Le serveur STUN public de Google est utilisé par défaut. Sur certains réseaux (opérateurs mobiles, entreprises), la connexion directe est bloquée : il faut alors un serveur **TURN** (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`). C'est un relais temporaire, rien n'est conservé.
- Le micro et la caméra exigent HTTPS (ou `localhost`).
- L'état des appels est en base (tables `Call` et `GroupCallParticipant`) : plusieurs instances Vercel peuvent se partager un appel. Un appel dont un participant ne donne plus signe de vie pendant 45 s est terminé, et une sonnerie sans réponse devient « manquée » au bout de 45 s.

**Mise à jour d'une base existante** : relance `npx prisma db push`. Les ajouts sont tous facultatifs ou ont une valeur par défaut : tes données actuelles restent intactes.

## Fonctions de type WhatsApp

**Messages.** Appui long (ou clic sur la flèche au survol) sur une bulle pour ouvrir le menu.
- *Répondre* : la citation s'affiche dans la bulle, un clic dessus renvoie au message d'origine (même ancien).
- *Modifier* : ses propres messages texte, pendant 15 minutes (`EDIT_WINDOW_MS`). La mention « modifié » apparaît.
- *Supprimer* : « pour moi » (masqué chez toi seulement) ou « pour tous » (48 h maximum, `DELETE_FOR_ALL_WINDOW_MS`). Pour tous : le texte, le fichier et les réactions sont réellement effacés de la base, il ne reste que « Ce message a été supprimé ».
- *Réactions* : 6 emojis, une réaction par personne et par message ; toucher sa propre réaction la retire.
- *Transférer* vers 5 discussions au maximum (le fichier est copié), *Copier*.

**Profil et groupes.** Menu ⋮ → ton profil (nom, info, photo). Toucher l'en-tête d'une discussion ouvre le panneau d'infos : pour un groupe, nom, description, photo, liste des membres, ajout/retrait de participants, nomination d'administrateurs, quitter le groupe. Seuls les administrateurs modifient le groupe ; il garde toujours au moins un administrateur (le membre le plus ancien reprend le rôle si le dernier part). Les changements apparaissent dans la discussion sous forme de lignes d'information (« Léa a ajouté Marc »). Un nouveau membre ne voit pas les messages d'avant son arrivée. Les photos (profil et groupe) sont recadrées en carré et réduites à 384 px dans le navigateur, puis stockées dans la table `AvatarImage`.

**Organisation.**
- *Recherche* : la barre de la liste cherche dans les noms de discussions **et** dans tous les messages (texte et noms de fichiers) ; l'icône loupe de l'en-tête cherche dans une seule discussion. Un résultat ouvre la discussion à l'endroit du message. La recherche est un `ILIKE` PostgreSQL sans index : parfaite pour un usage courant, à remplacer par une recherche plein texte si la base devient très grosse.
- *Épingler* (3 maximum), *archiver* et *sourdine* (8 heures, 1 semaine, toujours) : appui long sur une discussion de la liste, ou panneau d'infos. Ces réglages sont personnels. Une discussion archivée le reste quand de nouveaux messages arrivent (le compteur s'affiche sur la ligne « Archivées »). En sourdine, plus de notification push (les appels sonnent toujours).

**Messages éphémères.** Panneau d'infos → Messages éphémères : 24 heures, 7 jours ou 90 jours (pour un groupe, administrateurs seulement). Ne concerne que les **nouveaux** messages. Ils sont masqués dès leur échéance, puis supprimés pour de bon (fichiers compris) par une purge (`src/lib/expiry.ts`) qui tourne chaque minute tant que quelqu'un est connecté, et une fois par jour par la tâche planifiée Vercel.

**Appels de groupe.** Boutons téléphone et caméra de l'en-tête d'un groupe. Les autres membres reçoivent l'appel (sonnerie ou notification) et peuvent rejoindre à tout moment via le bandeau « Rejoindre » de la discussion tant que l'appel dure.
- Chaque participant est relié directement à chacun des autres (maillage WebRTC) : simple et sans serveur média, mais l'upload de chacun est multiplié par le nombre de participants. La limite est donc de **6 personnes** (`MAX_GROUP_CALL_PEOPLE`) ; l'image est envoyée en 640×360 en groupe. Au-delà, il faudrait un serveur média (SFU) comme LiveKit.
- Sur certains réseaux un serveur TURN devient indispensable (voir plus haut), et encore plus en groupe.
- Le résultat de l'appel (durée, manqué) apparaît dans la discussion comme pour un appel à deux.

## Notifications push (facultatif)

```bash
npx web-push generate-vapid-keys
```

Colle la clé publique dans `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, la privée dans `VAPID_PRIVATE_KEY`, relance, puis « Activer les notifications » dans le menu. Elles partent uniquement aux personnes sans appareil connecté. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil.

## Structure

```
src/app/api/realtime/      stream (flux SSE), action (messages texte, lu, « écrit… », appels), bye (sortie propre)
prisma/schema.prisma       User, Conversation, Participant, Message, Reaction, StarredMessage, MessageHide, Attachment, AvatarImage, Call, MessageReceipt, PushSubscription
public/sw.js               Service worker (cache statique, page hors connexion, push)
src/middleware.ts          Protège /chat
src/app/(auth)/            Pages connexion et inscription
src/app/chat/              Liste + discussion (layout = ChatProvider + Sidebar)
src/app/api/               auth, users, profile, avatars, search, conversations (+ members, settings, avatar), messages (+ reaction, forward), attachments, calls/ice, push
src/components/chat/       ChatProvider (état + temps réel), Sidebar, ChatView, Composer, MessageBubble, MessageMenu, ConversationInfo, ProfileDialog…
src/components/call/       CallProvider (WebRTC 1-à-1), GroupCallScreen ; src/hooks/useGroupCall.ts (maillage de groupe)
src/lib/                   prisma, auth (JWT), realtime (file d'événements Neon), rt-actions, rt-calls, background, session, conversations, messages, expiry, avatars, safe-fetch, link-preview, push, rate-limit, image, ringtone…
```

## Comment marche le temps réel

Vercel exécute des fonctions courtes, sans mémoire, et ne peut pas garder de WebSocket ouvert. Rodchat n'en a donc pas besoin :

```
 Navigateur ──POST /api/realtime/action──▶ fonction Vercel ──écrit──▶ Neon (table RealtimeEvent)
     ▲                                                                        │
     └────────── flux SSE /api/realtime/stream ◀────── relit toutes les 500 ms ┘
```

- **Navigateur → serveur** : des requêtes POST (message texte, « lu », « en train d'écrire », signalisation des appels).
- **Serveur → navigateur** : un flux SSE par onglet. Chaque flux relit la table `RealtimeEvent` et ne renvoie que ce qui concerne la personne : ses événements, ceux de ses discussions (appartenance relue en base, donc quelqu'un retiré d'un groupe ne reçoit plus rien), et ceux de son onglet. Après ~50 s le flux se referme proprement et le navigateur le rouvre en reprenant au dernier événement reçu : rien n'est perdu, et on reste sous la durée maximale d'une fonction Vercel.
- **Présence** : chaque flux donne un signe de vie toutes les 8 s (`RealtimeConnection`). Un appareil sans signe de vie depuis 30 s est « hors ligne » : il reçoit alors les notifications push, et ses contacts voient « dernière connexion ».
- **Appels** : l'état (qui sonne, qui est dans l'appel) est dans `Call` et `GroupCallParticipant`. Le son et l'image passent toujours directement d'un appareil à l'autre.
- Délai typique d'un message : 0,5 à 1 s.

## Déploiement : Vercel + Neon

1. **Neon** : crée un projet. Dans « Connect », copie la chaîne **poolée** (hôte avec `-pooler`) et la chaîne **directe**.
2. **Tables** : depuis ton ordinateur, avec `.env` rempli (`DATABASE_URL`, `DIRECT_URL`) : `npx prisma db push`. À refaire après chaque mise à jour du schéma. Les ajouts sont facultatifs ou ont une valeur par défaut : tes données restent intactes.
3. **Vercel** : importe le dépôt (« Add New → Project »). Framework : Next.js, rien d'autre à régler. Variables d'environnement :

   | Variable | Valeur |
   | --- | --- |
   | `DATABASE_URL` | chaîne poolée, avec `&pgbouncer=true&connect_timeout=15` à la fin |
   | `DIRECT_URL` | chaîne directe |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | facultatif, pour les notifications (`npx web-push generate-vapid-keys`) |
   | `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | facultatif, voir plus haut |

4. Déploie. Ouvre le site sur deux appareils (ou un en navigation privée), crée deux comptes et discute.

> Après avoir dézippé, lance une fois `npm install` : cela met `package-lock.json` à jour (Socket.IO, tsx et cross-env ne sont plus nécessaires).

**À savoir sur l'offre gratuite :**

- **Neon ne s'endort plus tant que quelqu'un est connecté.** Chaque onglet ouvert interroge la base toutes les 500 ms ; sans personne de connecté, Neon se met en veille normalement. Les onglets cachés coupent leur flux après une minute, donc seuls les onglets réellement ouverts à l'écran comptent. Surveille quand même les heures de calcul dans le tableau de bord Neon. Le premier message après une longue veille met 1 à 2 s de plus (réveil de Neon).
- **Durée des fonctions** : le flux SSE est limité à 60 s par fonction (compatible plan Hobby), d'où la réouverture automatique toutes les ~50 s. Elle est invisible pour la personne.
- **Fichiers de 4 Mo maximum** : Vercel refuse les envois de plus de 4,5 Mo. La limite est réglée à 4 Mo sur Vercel (`NEXT_PUBLIC_MAX_UPLOAD_MB` pour la baisser). Les photos sont réduites avant l'envoi et les vocaux sont légers ; les vidéos et gros documents sont concernés. Pour aller au-delà, il faudrait envoyer les fichiers vers un stockage (Vercel Blob, S3…) au lieu de PostgreSQL.
- **Onglets en arrière-plan** : un onglet caché depuis plus d'une minute (et hors appel) coupe son flux : la personne passe « hors ligne », reçoit les notifications push, et Neon peut se rendormir. Au retour sur l'onglet, tout se rattrape tout seul. Pendant un appel, le flux reste ouvert.
- **Appels** : un appel de groupe se limite à 6 personnes (maillage WebRTC). Un serveur TURN devient indispensable sur de nombreux réseaux mobiles.
- **Service worker et push** : inchangés (HTTPS fourni par Vercel).
- **Limiteur de débit** : connexion, inscription, invitations, envois de fichiers et avatars sont limités par un compteur stocké dans Neon (table `RateLimit`), valable pour toutes les instances. Les usages très fréquents (recherche, réactions, signalisation des appels) utilisent un compteur en mémoire, plus approximatif.
- **Messages éphémères** : purgés chaque minute tant que quelqu'un est connecté, et une fois par jour par la tâche planifiée `vercel.json` (maximum du plan gratuit). Les messages expirés restent de toute façon masqués immédiatement.

## Compléments : aperçus, favoris, galerie, invitations, réglages

**Aperçu de liens.** Les adresses `http(s)` d'un message deviennent cliquables, et une carte (titre, description, image) apparaît sous le message quelques instants après l'envoi. C'est le **serveur** qui va chercher la page ; il refuse toute adresse locale ou privée (réseau interne, métadonnées du cloud, adresses IP déguisées en décimal ou hexadécimal), les ports non standard, les identifiants dans l'adresse, et revérifie chaque redirection (`src/lib/safe-fetch.ts`, testé). L'image est elle aussi servie par ton serveur (`/api/link-preview/image`) : le site visité ne voit jamais l'adresse IP de tes contacts. Les aperçus sont gardés 30 minutes en mémoire pour ne pas rappeler le site.

**Favoris.** Menu d'un message → *Ajouter aux favoris* (une étoile apparaît dans la bulle). Menu ⋮ → *Messages favoris* liste tous les favoris de toutes les discussions ; un clic ouvre la discussion au bon message. Les favoris sont personnels et synchronisés entre tes appareils. Un message supprimé pour tous, expiré ou d'un groupe quitté disparaît des favoris.

**Partager.** Menu d'un message texte → *Partager* ouvre le menu de partage du téléphone (si le navigateur le permet).

**Galerie de médias.** Panneau d'infos → *Médias, vocaux et documents* : onglets Photos, Vidéos, Vocaux, Documents, avec lecture sur place, téléchargement et « Voir dans la discussion ».

**Lien d'invitation.** Panneau d'infos d'un groupe (administrateurs) → *Lien d'invitation* : créer, copier, partager, réinitialiser (l'ancien lien cesse de fonctionner) ou révoquer. Quiconque a le lien et un compte rejoint directement le groupe (page `/join/<code>`) ; si la personne n'est pas connectée, elle revient sur le lien après s'être connectée ou inscrite. Il n'y a pas de validation par un administrateur.

**Paramètres.** Menu ⋮ → *Paramètres* :
- *Thème* automatique, clair ou sombre, enregistré en base et dans un cookie (pas de clignotement au chargement).
- *Accusés de lecture* : désactivés, tes contacts voient « remis » mais jamais « lu ». Le réglage ne s'applique pas dans l'autre sens (tu vois toujours les accusés des autres).
- *Dernière connexion* : désactivée, elle n'est plus envoyée à personne. Le statut « en ligne » reste visible.
- *Notifications* sur l'appareil.

**Réactions.** 8 emojis : 👍 ❤️ 😂 😮 😢 🙏 👏 🔥.

## Pistes pour la suite

Mentions `@` dans les groupes, statuts, liste de personnes bloquées, appels de groupe de plus de 6 personnes (serveur média), restriction « seuls les admins écrivent » dans un groupe, chiffrement de bout en bout, limiteur de débit partagé (Redis) si plusieurs instances, recherche plein texte pour une très grosse base.
