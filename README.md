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

**Compte et sécurité** (*Paramètres → Compte et sécurité*). *Changer mon mot de passe* ; *Appareils connectés* (voir plus bas) ; *Déconnecter mes autres appareils* (les anciens jetons de connexion cessent immédiatement de valoir, avec un délai de quelques secondes au plus) ; *Supprimer mon compte* (mot de passe demandé, suppression définitive : profil, discussions à deux et messages ; les contacts voient la discussion disparaître).

**Signalements.** Menu d'un message → *Signaler*, ou *Signaler* dans les infos d'un contact. La personne n'est pas prévenue. Les signalements arrivent dans l'espace admin (ci-dessous).

**Espace admin** (`/admin`, ou *Espace admin* dans le menu ⋮ pour les administrateurs).

*Devenir administrateur :* il n'y a pas de compte admin livré avec l'application (ce serait une faille). Crée un compte normal, puis mets son nom d'utilisateur dans la variable `ADMIN_USERNAMES` sur Vercel (plusieurs : séparés par des virgules) et redéploie. Aucune action de l'application ne peut donner ce statut à quelqu'un d'autre : seule cette variable fait foi. Les autres personnes voient une page « introuvable » sur `/admin`.

*Ce que l'admin peut faire :*
- **Tableau de bord** : nombre de comptes, actifs sur 24 h, nouveaux, messages, groupes, statuts, signalements ouverts, et l'espace utilisé dans Neon par rapport aux 512 Mo de l'offre gratuite.
- **Utilisateurs** : recherche, et pour chaque compte *suspendre* (avec motif ; connexion impossible et appareils déconnectés en quelques secondes) ou *réactiver*, *déconnecter ses appareils*, *réinitialiser le mot de passe* (un mot de passe temporaire est affiché une seule fois), *supprimer le compte* (définitif, nom d'utilisateur à retaper).
- **Groupes** : liste (nom, membres, nombre de messages) et suppression d'un groupe.
- **Signalements** : motif, extrait du message conservé, *marquer comme traité*, *supprimer le message* pour tout le monde, *suspendre la personne*. Onglet des signalements déjà traités.
- **Réglages** : inscription *ouverte*, *sur invitation* (code modifiable, lien à partager) ou *fermée*, et une **annonce** affichée à tous les utilisateurs connectés (qu'ils peuvent fermer). Ces réglages l'emportent sur la variable `INVITE_CODE`.
- **Journal** : trace de toutes les actions d'administration (qui, quoi, sur qui, quand).

*Garde-fous :* un administrateur ne peut ni se suspendre ni se supprimer, ni modifier un autre administrateur depuis l'espace admin ; chaque action est vérifiée côté serveur et journalisée. **Pour la vie privée, l'espace admin ne permet pas de lire les conversations** : il ne montre que le contenu des messages qui ont été signalés. Cette limite est volontaire (voir la politique de confidentialité, qui précise par ailleurs que l'administrateur peut techniquement accéder à la base de données).

**Messages programmés.** Quand tu as écrit un message, l'icône calendrier à côté du bouton d'envoi permet de choisir l'heure (dans 1 h, ce soir, demain, ou une date précise, jusqu'à 30 jours). Tu peux voir et annuler les messages en attente dans la même fenêtre (20 maximum). **Limite à connaître :** sur l'offre gratuite de Vercel, il n'y a pas de tâche planifiée plus fréquente qu'une par jour. Le message part donc à l'heure dite tant qu'au moins une personne utilise Rodchat à ce moment-là (chaque onglet ouvert vérifie toutes les ~5 secondes) ; sinon il part à la prochaine visite, au plus tard à la tâche quotidienne. Avec l'offre Pro de Vercel, remplace le calendrier dans `vercel.json` par `* * * * *` pour un envoi à la minute près même sans personne en ligne.

**Pages légales.** `/conditions` et `/confidentialite` (publiques, liées depuis l'inscription et les paramètres) décrivent ce que fait réellement l'application, y compris le fait qu'elle **n'est pas chiffrée de bout en bout**. Ce sont des modèles rédigés pour Rodchat : fais-les relire par un professionnel du droit et adapte-les à ton pays avant un lancement public.

**Inscription sur invitation (facultatif).** Définis `INVITE_CODE` dans Vercel : l'inscription demande alors ce code (vérifié côté serveur, comparaison à durée constante). Pour inviter quelqu'un, envoie-lui le lien `https://ton-site.vercel.app/register?code=TON_CODE`, qui remplit le champ tout seul. Sans la variable, l'inscription reste ouverte à tous. Les personnes déjà inscrites ne sont pas concernées.

**Messages épinglés.** Menu d'un message → *Épingler* (texte, photo, vidéo, vocal, fichier). Jusqu'à 3 messages par discussion, visibles par tous les membres dans une barre sous l'en-tête ; un toucher mène au message (et passe au suivant s'il y en a plusieurs). Une ligne « X a épinglé un message » s'ajoute dans la discussion. Au-delà de 3, le plus ancien est désépinglé.

**Répondre à un statut.** Dans le lecteur de statuts, un champ « Répondre à… » envoie un message dans votre discussion à deux, avec le statut cité en haut de la bulle. Le statut se met en pause pendant que tu écris.

**Glisser pour répondre.** Sur téléphone et tablette, glisse un message vers la droite pour y répondre (le défilement vertical reste libre ; un léger retour haptique confirme le geste).

**Liste des discussions.** Trois filtres sous la recherche : *Toutes*, *Non lues* (avec leur nombre) et *Groupes*. Un badge **@** apparaît sur un groupe quand un message non lu te mentionne.

**À l'ouverture d'une discussion.** Un séparateur « N messages non lus » s'affiche avant le premier message non lu (et la discussion s'ouvre dessus quand il y en a beaucoup). S'il y a des mentions, un bouton **@** flottant, avec leur nombre, t'y emmène une par une.

**Logo et démarrage.** Le logo est en vecteur (SVG) donc net à toutes les tailles : `public/logo.svg` (avec fond), `public/logo-mark.svg` (bulle seule), `public/icons/logo-1024.png` (1024 px, pour les boutiques d'applications ou les réseaux sociaux) et `src/components/Logo.tsx`. L'icône d'onglet du navigateur est aussi en SVG (`src/app/icon.svg`). Au démarrage, une animation d'une seconde et demie (la bulle apparaît, le « R » se pose, le nom se déploie) s'affiche **une fois par session**, se ferme d'un toucher, et reste calme pour les personnes qui ont réduit les animations. La page de connexion affiche une conversation qui se joue toute seule, les atouts de l'application, un œil pour voir le mot de passe, un avertissement si les majuscules sont verrouillées, et un lien « mot de passe oublié » (voir plus bas).

**Économie de données (mode faible connexion).** *Paramètres → Économie de données* : *automatique* (s'active quand la connexion est lente ou que le téléphone est en économie de données), *toujours* ou *jamais*. Activée : les photos des autres se chargent au toucher (avec leur taille), les aperçus de liens sont masqués, les vidéos ne se préchargent pas, et tes photos partent en 1024 px plus compressées au lieu de 1600 px. Le réglage est enregistré sur l'appareil. Le reste du mode « faible connexion » du document (reprise des envois, indication d'état réseau) existait déjà.

**Vocaux.** Un bouton **1× / 1,5× / 2×** sur chaque vocal change la vitesse de lecture ; le choix vaut pour tous les vocaux jusqu'à ce que tu le changes. (La transcription en texte n'existe pas : elle demande un service d'IA.)

**Sondages.** Dans la zone de saisie, trombone → *Sondage* : une question, 2 à 6 réponses, un ou plusieurs choix. On vote en touchant une réponse (un second toucher retire le vote) ; les résultats se mettent à jour en direct, avec le nombre de personnes qui ont voté. Les sondages se suppriment, s'épinglent, et apparaissent dans la liste des discussions (« Sondage : … »). Ils ne se transfèrent pas.

**Télécharger mes données.** *Paramètres → Compte et sécurité → Télécharger mes données* : un fichier JSON avec ton profil, tes discussions, tes propres messages (jusqu'à 20 000), tes statuts en cours, tes blocages et tes messages programmés. Les messages des autres ne sont pas inclus (ce sont leurs données) ; les fichiers sont listés mais pas inclus. Limité à 3 téléchargements par heure.

**Indicateurs (admin).** `/admin/metrics` reprend la section 7 du document : actifs sur 24 h / 7 j / 30 j, inscriptions et messages par jour (14 jours), personnes qui ont écrit, rétention à 7 et 30 jours, part de messages remis et délai de remise (médian et 95 %), appels aboutis, signalements (en attente, délai de traitement), stockage (base, pièces jointes, par compte actif). Tout est calculé à partir de données qui existent déjà, sans lire le contenu des messages. Les indicateurs qui dépendent de choses qui n'existent pas encore (satisfaction, conversions Premium, entreprises, coût de l'IA) sont signalés comme non mesurés.

**Statuts vidéo et anneau autour des photos.** On peut publier une **vidéo** (MP4, MOV ou WebM, 30 secondes et 4 Mo maximum sur Vercel : une vidéo de 10 à 15 secondes passe en général) en plus d'un texte ou d'une photo ; le lecteur la joue avec le son (bouton pour le couper), l'enchaîne avec les suivants, et se met en pause quand on maintient le doigt ou qu'on écrit une réponse. Et **partout où la photo de quelqu'un apparaît** (liste des discussions, en-tête d'une discussion, appels, groupes, listes de membres, à côté du nom de l'expéditeur dans un groupe), un **anneau** s'affiche autour quand cette personne a un statut : **orange vif** s'il y a un statut que tu n'as pas vu, **gris discret** si tu l'as déjà vu. Dans les infos d'un contact, dans la liste des membres d'un groupe et à côté du nom d'un expéditeur, un toucher sur la photo ouvre son statut. (Seuls les statuts de tes contacts, c'est-à-dire les personnes avec qui tu as une discussion à deux, sont visibles : les autres membres d'un groupe n'ont pas d'anneau.)

**Stockage (admin) et nettoyage automatique.** `/admin/storage` (*Stockage* dans l'espace admin) montre l'espace occupé par les médias et par la base, ce qui est stocké par type, les 25 plus gros fichiers (type, taille, date, auteur : jamais le contenu), et permet de **supprimer** : par critères (photos, vidéos, vocaux, documents ; plus anciens que 7 jours à 1 an ; d'une taille minimale), avec l'estimation de l'espace libéré avant de confirmer, ou un fichier à la fois. Un fichier supprimé laisse le message en place avec la mention « Fichier supprimé pour libérer de l'espace » ; les médias épinglés ou en favoris sont toujours conservés. **Sans l'administrateur :** quand les médias en ligne atteignent **90 %** de leur budget, l'application supprime d'elle-même les plus anciens (jamais ceux des 7 derniers jours, ni les épinglés ou favoris) jusqu'à repasser sous 75 % ; en urgence (base à 95 % de l'espace total) elle va plus loin (60 %, médias de plus d'un jour). La vérification a lieu après chaque envoi de fichier ou de statut (au plus toutes les 5 minutes) et chaque jour par la tâche planifiée. Chaque nettoyage automatique est inscrit dans le *Journal* et affiché dans la page Stockage ; si rien d'assez ancien n'existe pour libérer assez d'espace, la page le signale en rouge. Réglages : `STORAGE_QUOTA_MB` (espace total, 512 par défaut = offre gratuite de Neon) et `STORAGE_MEDIA_BUDGET_MB` (part réservée aux médias, 70 % de l'espace par défaut). **À savoir :** PostgreSQL réutilise l'espace libéré pour les nouveaux fichiers, mais la taille totale de la base peut ne pas redescendre tout de suite ; le chiffre « Médias en ligne » montre le gain réel.

**Nouveautés de confort.**
- **Brouillons** : le message commencé dans une discussion est gardé sur l'appareil quand tu la quittes et réapparaît à la réouverture ; la liste affiche « Brouillon : … » en orange.
- **Infos d'un message** (menu d'un de tes messages → *Infos*) : qui l'a reçu, qui l'a lu, et à quelle heure. Les personnes qui ont désactivé leurs accusés de lecture apparaissent « reçu », jamais « lu ».
- **Groupes en mode annonce** : dans les infos d'un groupe, un admin coche *Seuls les admins peuvent écrire*. Les autres membres lisent et réagissent, mais la zone de saisie est remplacée par un message ; l'envoi est aussi refusé côté serveur (messages, fichiers, sondages, messages programmés).
- **Sélecteur d'emojis** (bouton souriant à côté de la zone de saisie, sur écran large) : récents, 8 catégories et recherche en français (« rire », « merci », « cœur »…). Sur téléphone, le clavier du système a déjà ses emojis.
- **Couleur de l'application** (*Paramètres → Couleur*) : aubergine, océan, forêt, framboise, ardoise ou terre cuite, en thème clair comme sombre. Choix enregistré sur l'appareil, sans clignotement au chargement.
- **Verrouillage par code** (*Paramètres → Verrouillage de l'application*) : un code de 4 à 6 chiffres masque Rodchat au démarrage et quand tu reviens après le délai choisi (tout de suite, 1 min, 5 min ou au démarrage seulement) ; 5 essais ratés = 30 secondes d'attente. Le code n'est gardé que sur l'appareil, sous forme d'empreinte, et ne se récupère pas : en cas d'oubli, on se déconnecte puis on se reconnecte. Il protège contre quelqu'un qui prend ton téléphone ouvert, pas contre quelqu'un qui maîtrise les outils du navigateur.
- **Exporter une discussion** (infos du contact ou du groupe) : un fichier texte avec tout ce que tu y vois, aux heures de ton fuseau (jusqu'à 20 000 messages ; les médias sont mentionnés, pas inclus).
- **Partager ma position** (trombone → *Position*) : envoie un lien vers la carte OpenStreetMap, après l'autorisation de ton navigateur.

**Mot de passe oublié (validé par l'administrateur).** Sur la page de connexion, *Mot de passe oublié ?* ouvre une page où la personne indique **son numéro de téléphone (ou son nom d'utilisateur)**, **choisit un nouveau mot de passe** (deux fois) et écrit **comment l'administrateur peut l'identifier** (nom, numéro, un détail que seul elle connaît). La demande part à l'administrateur ; en attendant, l'ancien mot de passe reste valable. Dans l'espace admin, l'onglet **Mots de passe** (avec une pastille du nombre de demandes en attente, aussi visible sur *Espace admin* dans le menu) liste les demandes avec ce que la personne a écrit, la date de création du compte et sa dernière activité. **Approuver** : le mot de passe choisi devient celui du compte et tous ses appareils sont déconnectés ; les autres demandes en attente du même compte sont refusées. **Refuser** : rien ne change. Le mot de passe choisi n'est jamais enregistré en clair (seule son empreinte l'est, et elle ne sert qu'après approbation). La page répond de la même façon que le compte existe ou non, et limite les demandes (5 par heure et par adresse, 5 par jour et par compte, 3 en attente par compte). **Important :** n'importe qui peut faire une demande au nom de quelqu'un d'autre, donc **vérifie toujours l'identité par un autre moyen avant d'approuver** (appel, message, en personne). Les demandes sans réponse sont supprimées après 7 jours.

*Si l'administrateur lui-même oublie son mot de passe* (les comptes admin n'utilisent pas ce circuit) : génère une empreinte avec `node -e "console.log(require('bcryptjs').hashSync('NouveauMotDePasse',10))"`, puis dans l'éditeur SQL de Neon : `UPDATE "User" SET "passwordHash" = '<empreinte>', "sessionVersion" = "sessionVersion" + 1 WHERE username = 'ton_pseudo';`

**Appareils connectés.** *Paramètres → Appareils connectés* liste les appareils où ton compte est ouvert (« Chrome sur Windows », « Safari sur iOS »…, date de connexion, dernière activité, « Cet appareil »), avec un bouton **Déconnecter** pour chacun des autres ; la déconnexion prend effet en quelques secondes. Se déconnecter, changer le mot de passe ou *Déconnecter mes autres appareils* mettent la liste à jour. Les connexions d'avant cette fonction apparaissent quand on ouvre la liste depuis chaque appareil.

**Sélection de plusieurs messages.** Menu d'un message → *Sélectionner* : des cases apparaissent, on coche les messages d'un toucher, et une barre propose **Copier** (le texte, avec l'heure et l'auteur), **Favori**, **Transférer** (dans l'ordre, vers une ou plusieurs discussions) et **Supprimer** (pour moi, ou pour tout le monde si tous les messages sont les miens et récents). Échap ou la croix quitte la sélection.

**Partage d'écran.** Pendant un **appel vidéo à deux**, un bouton écran permet de partager son écran à la place de la caméra ; l'autre personne le voit en entier (non recadré) et un bandeau « Tu partages ton écran » s'affiche. Le partage s'arrête avec le même bouton ou avec le bouton du navigateur. Disponible sur **ordinateur** seulement : les navigateurs de téléphone ne savent pas partager l'écran, et le bouton n'apparaît pas. (Pas encore dans les appels de groupe ni les appels audio.)

**Inscription par numéro de téléphone et recherche de contacts.**

*Inscription et connexion.* À l'inscription, on donne son **numéro** (pays + numéro, le pays est proposé d'après le fuseau horaire), son nom et un mot de passe : le nom d'utilisateur est **généré automatiquement** (par exemple `koffi_4821`) et sert aux mentions. On se connecte avec **son numéro, écrit comme à l'inscription (`07 12 34 56 78`) ou avec l'indicatif (`+225 07 12 34 56 78`), ou avec son nom d'utilisateur**. Si plusieurs comptes ont annoncé le même numéro, c'est le mot de passe qui départage. Les comptes existants gardent leur nom d'utilisateur et peuvent ajouter leur numéro dans *Paramètres → Mon numéro*. Le numéro n'est **jamais montré aux autres personnes**.

*Numéro vérifié ou non.* Un numéro saisi à l'inscription est d'abord **non vérifié**. Il devient **vérifié** de deux façons :
- **par SMS** : si un service d'envoi est configuré (variables `SMS_PROVIDER="twilio"`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` et `TWILIO_FROM` ou `TWILIO_MESSAGING_SERVICE_SID`), *Paramètres → Mon numéro → Recevoir un code par SMS* envoie un code à 6 chiffres (valable 10 minutes, 5 essais ; 3 envois par heure et par compte, 5 par jour et par numéro). Chaque SMS est facturé par le service d'envoi ;
- **par l'administrateur** : dans *Admin → Utilisateurs*, le numéro de chaque compte est affiché avec *Marquer le numéro comme vérifié* (après l'avoir appelé ou lui avoir écrit, par exemple). C'est la solution gratuite pour une petite communauté.

Pourquoi cette vérification : sans elle, quelqu'un pourrait créer un compte avec le numéro d'un autre et apparaître dans les contacts de cette personne sous son nom. C'est pourquoi **seuls les numéros vérifiés servent à retrouver ses contacts**, et il faut avoir soi-même un numéro vérifié pour lancer une recherche. Un numéro vérifié est unique (un seul compte), tandis que plusieurs comptes peuvent annoncer le même numéro non vérifié : on ne révèle donc jamais qu'un numéro est déjà utilisé.

*Retrouver ses contacts.* *Nouvelle discussion → Retrouver mes contacts* : on **choisit dans les contacts du téléphone** (sélecteur natif, disponible sur Chrome pour Android) ou on **importe un fichier de contacts `.vcf`** (export des contacts de n'importe quel téléphone ou de Google Contacts). Rodchat montre alors **qui est déjà sur l'application** (avec le nom tel qu'il est dans ton carnet) avec un bouton *Écrire*, et propose d'**inviter** les autres par SMS avec le lien d'inscription. Les numéros sont convertis en empreintes SHA-256 **dans le navigateur** avant d'être comparés : le service ne reçoit ni ne conserve ton carnet d'adresses. Chacun peut refuser d'être retrouvé (*Me retrouver par mon numéro*). Limites : 20 recherches par jour et par personne, 500 numéros à la fois ; les personnes bloquées ou qui t'ont bloqué n'apparaissent pas.

*Ce qui n'est pas « comme WhatsApp » :* une application web **ne peut pas lire le carnet d'adresses toute seule** : il faut le choisir ou l'importer à chaque fois (une application installée sur le téléphone le pourrait, une page web non). Il n'y a pas non plus de vérification par appel automatique.

*Liste des inscrits.* Dans *Admin → Réglages*, la **liste de tous les inscrits** dans « Nouvelle discussion » peut être **masquée** : on retrouve alors ses contacts par leur numéro, ou en écrivant le nom d'utilisateur exact.

**Barre de navigation.** À gauche sur ordinateur (en onglets en bas sur téléphone) : *Discussions* (pastille = nombre de discussions non lues, hors archives et sourdines), *Appels*, *Statuts* (point quand il y en a de nouveaux), puis en bas *Messages favoris*, *Paramètres* et ton *profil*. L'onglet **Appels** affiche l'historique (entrants, sortants, manqués, refusés, avec la durée) et un bouton pour **rappeler** en un geste, en audio ou en vidéo ; pour un appel de groupe encore en cours, il propose de le rejoindre.

**Statuts.** Le bouton en forme de cercle en pointillés (en haut de la liste) ouvre les statuts : on publie un **texte sur fond coloré** ou une **photo avec légende**, visibles **24 h** par les personnes avec qui on a une discussion à deux (hors personnes bloquées). Les statuts non vus sont signalés par une pastille ; le lecteur plein écran avance tout seul (toucher à droite/gauche pour naviguer, maintenir pour mettre en pause). L'auteur voit **qui a vu** son statut et peut le supprimer. Les statuts expirés sont supprimés automatiquement avec leurs photos (les photos comptent dans la limite de 4 Mo sur Vercel).

**Blocage.** Dans « Infos du contact », *Bloquer* empêche toute nouvelle écriture et tout appel entre vous deux. La personne bloquée voit seulement « Tu ne peux pas écrire à cette personne » (on ne lui dit jamais qu'elle est bloquée) ; toi, tu vois un bandeau *Débloquer* à la place de la zone de saisie. Les anciens messages restent.

**Mentions.** Dans un groupe, taper `@` propose les membres ; le message cite `@pseudo`. La personne citée reçoit une notification **même si le groupe est en sourdine**, et sa mention ressort dans le texte.

**Appels audio et vidéo (WebRTC).** Le son et l'image passent directement d'un appareil à l'autre : rien n'est stocké. Le serveur ne fait que mettre les deux appareils en relation (signalisation). Seul le résultat de l'appel (durée, manqué, refusé) est enregistré dans la table `Call` et affiché dans la discussion.

- Appels audio et vidéo dans les discussions à deux, et **appels de groupe** (voir plus bas).
- Le serveur STUN public de Google est utilisé par défaut. Sur certains réseaux (opérateurs mobiles, entreprises), la connexion directe est bloquée : il faut alors un serveur **TURN** (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`). C'est un relais temporaire, rien n'est conservé.
- Le micro et la caméra exigent HTTPS (ou `localhost`).
- L'état des appels est en base (tables `Call` et `GroupCallParticipant`) : plusieurs instances Vercel peuvent se partager un appel. Une sonnerie sans réponse devient « manquée » au bout de 45 s. Un appel de groupe dont un participant ne donne plus signe de vie pendant 45 s le retire ; un appel à deux déjà décroché n'est terminé qu'après 90 s sans aucun signe de vie (le son passe en direct : une coupure brève du flux de signalisation ne le raccroche pas).
- **Qualité et consommation** : l'image est demandée en 640×360 (480×270 en groupe) et plafonnée à 600 kbit/s (250 en groupe), le son à 32 kbit/s. Si la connexion directe est perdue, l'appelant relance la recherche d'un chemin réseau (jusqu'à 3 fois) avant de raccrocher au bout de 30 s. Les candidats ICE partent par lots (une seule requête au lieu d'une par candidat).
- **TURN, pour que les appels ne coupent pas sur les réseaux mobiles.** Le serveur STUN de Google ne suffit pas derrière la plupart des réseaux d'opérateurs (partage d'adresse, pare-feu) : la connexion directe échoue ou tombe. Prends un service TURN avec offre gratuite (par exemple Metered, Cloudflare Realtime ou Twilio ; vérifie leurs quotas actuels), puis renseigne `TURN_URL` (plusieurs adresses séparées par des virgules : privilégie celles en `turn:…:443?transport=tcp` et `turns:…:443`, qui passent partout), `TURN_USERNAME` et `TURN_CREDENTIAL` dans Vercel, et redéploie.

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

## Notifications push

Sans elles, personne n'est prévenu quand l'application est fermée : **elles sont indispensables**.

```bash
npx web-push generate-vapid-keys
```

Dans Vercel → *Settings → Environment Variables*, ajoute :

- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` : la clé publique (« Public Key ») ;
- `VAPID_PRIVATE_KEY` : la clé privée (« Private Key »), à garder secrète ;
- `VAPID_SUBJECT` : `mailto:` suivi de ton adresse e-mail.

Puis **redéploie** (la clé publique est intégrée à l'application à la construction). Le tableau de bord administrateur affiche en rouge « Notifications désactivées » tant que les clés manquent, et le nombre d'appareils abonnés sinon.

Chaque personne reçoit une invitation « Activer » à l'ouverture de l'application (une fois, puis rappel après 7 jours si elle choisit « Plus tard »), ou la trouve dans le menu et les réglages. Sur iPhone, l'app doit d'abord être ajoutée à l'écran d'accueil (iOS 16.4 ou plus).

**Ce qui déclenche une notification**

- un message (texte, photo, vidéo, vocal, document, sondage), dans une discussion à deux ou un groupe, sauf discussion en sourdine ;
- une mention (`@pseudo`), même en sourdine, et une réponse à son propre message ;
- un appel entrant (à deux ou de groupe), avec sonnerie persistante ;
- une réaction à son message, un vote à son sondage ;
- un ajout à un groupe (création ou ajout ultérieur) ;
- pour les administrateurs : une demande de mot de passe oublié et un signalement.

**Pastille sur l'icône.** Sur l'application installée (Chrome, Edge, Android, iPhone 16.4+), l'icône (barre des tâches, Dock, écran d'accueil) affiche un nombre : application fermée, le service worker l'augmente de 1 à chaque notification reçue ; application ouverte, elle indique le nombre de discussions non lues (hors sourdine et archives, sauf mention) et disparaît quand tout est lu. Le même nombre apparaît entre parenthèses dans le titre de l'onglet. Firefox ne gère pas les pastilles.

**Vérifier que tout marche.** *Réglages → Notifications → Envoyer une notification de test* : si rien ne part, le message dit précisément pourquoi (clés VAPID absentes, aucun appareil abonné, abonnement expiré). Le journal de Vercel contient aussi un avertissement `[push] Clés VAPID absentes` tant que les clés manquent.

Les notifications partent vers **tous** les appareils de la personne, connectés ou non. Le service worker n'en affiche aucune si l'application est ouverte, visible et active sur cet appareil (la personne la regarde) ; sur Safari, il en affiche une sans bruit et la retire aussitôt, sinon Safari supprime l'abonnement. Elles sont envoyées en priorité haute pour arriver même téléphone en veille. À la déconnexion, l'appareil est désabonné du compte ; à la connexion suivante, il est rattaché au nouveau compte.

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
     └────────── flux SSE /api/realtime/stream ◀────── relit la file (250 ms à 1 s) ┘
```

- **Navigateur → serveur** : des requêtes POST (message texte, « lu », « en train d'écrire », signalisation des appels).
- **Serveur → navigateur** : un flux SSE par onglet. Chaque flux relit la table `RealtimeEvent` et ne renvoie que ce qui concerne la personne : ses événements, ceux de ses discussions (appartenance relue en base, donc quelqu'un retiré d'un groupe ne reçoit plus rien), et ceux de son onglet. Après ~50 s le flux se referme proprement et le navigateur le rouvre en reprenant au dernier événement reçu : rien n'est perdu, et on reste sous la durée maximale d'une fonction Vercel.
- **Présence** : chaque flux donne un signe de vie toutes les 8 s (`RealtimeConnection`). Un appareil sans signe de vie depuis 30 s est « hors ligne » : ses contacts voient alors « dernière connexion » (les notifications push, elles, partent de toute façon vers tous les appareils).
- **Appels** : l'état (qui sonne, qui est dans l'appel) est dans `Call` et `GroupCallParticipant`. Le son et l'image passent toujours directement d'un appareil à l'autre.
- **Rythme de lecture** : le flux relit la file toutes les **1 s au repos**, 400 ms quand de l'activité vient d'arriver (15 s), et **250 ms pendant un appel** (le navigateur ajoute `?fast=1`). Les tâches de fond (appels en attente, messages programmés, présence) tournent toutes les 10 à 15 s. Cela divise par deux ou plus les requêtes vers Neon au repos.
- Délai typique d'un message : 0,3 à 1,2 s.
- **Région des fonctions Vercel** : chaque requête fait plusieurs allers-retours vers Neon. Si la base est en Europe et les fonctions aux États-Unis (région par défaut de Vercel), chaque aller-retour coûte 100 ms ou plus, et la signalisation d'un appel devient lente. Dans Vercel → *Settings → Functions → Function Region*, choisis la région **la plus proche de ta base Neon** (par exemple Paris `cdg1` ou Francfort `fra1` pour une base en Europe ; Neon l'indique dans *Settings → Region*).

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
   | `INVITE_CODE` | facultatif : code d'invitation de départ ; l'espace admin (Réglages) peut ensuite le remplacer |
   | `SMS_PROVIDER`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | facultatif : envoi des codes de vérification par SMS (Twilio) |
   | `ADMIN_USERNAMES` | **à définir** : noms d'utilisateur des administrateurs (séparés par des virgules), pour accéder à `/admin` |
   | `NEXT_PUBLIC_CONTACT_EMAIL` | facultatif : adresse de contact affichée dans les pages légales |
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | facultatif, pour les notifications (`npx web-push generate-vapid-keys`) |
   | `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL` | facultatif, voir plus haut |

4. Déploie. Ouvre le site sur deux appareils (ou un en navigation privée), crée deux comptes et discute.

> Après avoir dézippé, lance une fois `npm install` : cela met `package-lock.json` à jour (Socket.IO, tsx et cross-env ne sont plus nécessaires).

**À savoir sur l'offre gratuite :**

- **Neon ne s'endort plus tant que quelqu'un est connecté.** Chaque onglet ouvert interroge la base toutes les secondes (plus souvent pendant un appel) ; sans personne de connecté, Neon se met en veille normalement. Les onglets cachés coupent leur flux après une minute, donc seuls les onglets réellement ouverts à l'écran comptent. Surveille quand même les heures de calcul dans le tableau de bord Neon. Le premier message après une longue veille met 1 à 2 s de plus (réveil de Neon).
- **Durée des fonctions** : le flux SSE est limité à 60 s par fonction (compatible plan Hobby), d'où la réouverture automatique toutes les ~50 s. Elle est invisible pour la personne.
- **Fichiers de 4 Mo maximum** : Vercel refuse les envois de plus de 4,5 Mo. La limite est réglée à 4 Mo sur Vercel (`NEXT_PUBLIC_MAX_UPLOAD_MB` pour la baisser). Les photos sont réduites avant l'envoi et les vocaux sont légers ; les vidéos et gros documents sont concernés. Pour aller au-delà, il faudrait envoyer les fichiers vers un stockage (Vercel Blob, S3…) au lieu de PostgreSQL.
- **Onglets en arrière-plan** : un onglet caché depuis plus d'une minute (et hors appel) coupe son flux : la personne passe « hors ligne » et Neon peut se rendormir ; les notifications push continuent d'arriver. Au retour sur l'onglet, tout se rattrape tout seul. Pendant un appel, le flux reste ouvert.
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

**Confort d'écriture (ordinateur et téléphone).**
- *Mise en forme* dans un message : `*gras*` (ou `**gras**`), `_italique_`, `~barré~` et `` `code` ``. Les marques doivent toucher le texte et s'ouvrir en début de mot : `snake_case_nom`, `2*3*4` ou `* liste *` restent intacts, et rien ne traverse un retour à la ligne. Les adresses web ne sont jamais mises en forme. `Ctrl/⌘ + B` et `Ctrl/⌘ + I` entourent la sélection (code dans `src/lib/formatting.ts`).
- *Gros emojis* : un message qui ne contient que 1 à 3 emojis s'affiche en grand.
- *Coller une image* (capture d'écran, image copiée) dans le champ de saisie l'envoie comme photo ; le texte collé n'est pas touché.
- *Glisser-déposer* : lâcher des fichiers n'importe où dans la fenêtre d'une discussion les envoie (10 au plus à la fois, mêmes limites de taille que le bouton trombone).
- *Raccourcis clavier* : `Ctrl/⌘ + K` cherche, `Alt + ↑/↓` change de discussion. La liste est dans *Paramètres → Raccourcis clavier*.
- *Personnes bloquées* : *Paramètres → Personnes bloquées* liste tout le monde, avec un bouton « Débloquer ».
- *Marquer comme non lue* : appui long sur une discussion de la liste (ou menu ⋮) → « Marquer comme non lue ». Un point apparaît, compté dans le filtre « Non lues » et dans la pastille de l'icône ; il disparaît quand on ouvre la discussion (ou « Marquer comme lue »). Réglage personnel, synchronisé entre appareils.
- *Aperçu des notifications* : *Paramètres → Notifications → Afficher le contenu*. Désactivé, la notification dit seulement « Nouveau message », sans nom ni texte.

**Performance.** Les bulles de message sont mémoïsées (`BubbleRow`) : quelqu'un qui écrit, un changement de présence ou un nouveau message ne refait plus que la bulle concernée au lieu de toute la discussion, ce qui compte sur un téléphone d'entrée de gamme et une longue conversation. Les photos des messages, les aperçus de liens et les avatars sont chargés à la demande ; les fichiers et photos de profil sont mis en cache un an dans le navigateur (`immutable`).

**Après une mise à jour avec nouveaux champs :** lance `npx prisma db push` (cette version ajoute `Participant.markedUnread` et `User.pushPreview`, avec une valeur par défaut : aucune donnée n'est perdue).

## Pistes pour la suite

Appels de groupe de plus de 6 personnes (serveur média), chiffrement de bout en bout, limiteur de débit partagé (Redis) si plusieurs instances, recherche plein texte pour une très grosse base.


## Feuille de route (d'après la proposition d'évolution)

**Déjà dans l'application :** messages, réponses, citations, réactions, mentions, vocaux, appels audio/vidéo individuels et de groupe, photos, vidéos et fichiers, modification et suppression, épinglage, recherche et filtres, groupes, statuts, accusés de lecture et présence configurables, messages éphémères, blocage, signalement, mots de passe hachés, protection contre les tentatives abusives, déconnexion des autres appareils, suppression de compte, messages programmés, sondages, vitesse de lecture des vocaux, mode économie de données avec reprise des envois, export de ses données, inscription sur invitation, pages légales, espace admin avec indicateurs.

**Demande une décision ou un service externe avant de commencer (et donc pas fait) :**

| Pistes du document | Pourquoi ce n'est pas fait | Ce qu'il faut décider |
| --- | --- | --- |
| RodChat AI, traduction, transcription vocale | Nécessite un service d'IA payant à l'usage, et l'envoi de messages privés à un tiers | Quel prestataire, quel budget par utilisateur, consentement explicite et option « jamais envoyer mes messages » |
| Premium, Business, créateurs, paiements | Nécessite un prestataire de paiement (adapté aux pays visés), la facturation, les conditions de vente, et des fonctions qui valent vraiment l'abonnement | Qui paie quoi, quelles limites gratuites, quels pays et moyens de paiement |
| GIF et stickers | Nécessite un catalogue (souvent un service tiers avec clé d'API et conditions d'usage) | Choisir un catalogue ou créer des stickers propres |
| Chiffrement de bout en bout | Ce n'est pas un réglage mais une refonte (clés par appareil, sauvegardes, groupes) qui doit être testée sérieusement | Le faire vraiment, ou continuer à dire clairement qu'il n'y en a pas (c'est le cas dans les pages légales) |
| Communautés, chaînes, salles audio (les sondages existent) | Gros chantiers à part (rôles, diffusion à grande échelle, audio temps réel) | Priorité par rapport au reste, après avoir mesuré l'usage |
| Gestion détaillée des appareils (liste, noms) et verrouillage de conversations | Demande des sessions stockées par appareil ; le verrouillage doit être pensé avec la sécurité de l'appareil | À planifier ensuite |

**Indicateurs (section 7 du document) :** disponibles dans l'espace admin (`/admin/metrics`), calculés sans collecte supplémentaire. Reste à décider comment recueillir la satisfaction des utilisateurs, avec leur accord.
