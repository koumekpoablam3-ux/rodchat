import type { Metadata } from "next";
import LegalPage, { Contact, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Politique de confidentialité" updated="octobre 2026">
      <p>
        Rodchat est une messagerie. Cette page explique, simplement, quelles informations le service conserve, pourquoi,
        pendant combien de temps, et comment les contrôler.
      </p>

      <Section title="Ce que Rodchat conserve">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Ton compte :</strong> nom d&apos;utilisateur, nom affiché, photo et « infos » si tu les ajoutes. Ton mot
            de passe n&apos;est jamais conservé en clair : seule une empreinte irréversible est enregistrée.
          </li>
          <li>
            <strong>Tes conversations :</strong> les messages, photos, vidéos, vocaux et fichiers que tu envoies, les
            réactions, les accusés de réception et de lecture (désactivables), et les messages épinglés ou en favoris.
          </li>
          <li>
            <strong>Tes statuts :</strong> texte ou photo, supprimés automatiquement après 24 h, ainsi que la liste des
            personnes qui les ont vus.
          </li>
          <li>
            <strong>Tes appels :</strong> seulement le journal (qui, quand, durée, manqué ou non). Le contenu audio et vidéo
            n&apos;est pas enregistré : il passe directement d&apos;un appareil à l&apos;autre.
          </li>
          <li>
            <strong>Ta présence :</strong> « en ligne » et, si tu l&apos;autorises, « dernière connexion ».
          </li>
          <li>
            <strong>Tes appareils pour les notifications :</strong> l&apos;identifiant technique fourni par ton navigateur,
            uniquement si tu actives les notifications.
          </li>
          <li>
            <strong>Sécurité :</strong> ton adresse réseau (IP) est utilisée brièvement pour limiter les tentatives de
            connexion abusives, et supprimée en moins d&apos;une heure. Les signalements que tu envoies sont conservés
            jusqu&apos;à leur traitement.
          </li>
        </ul>
      </Section>

      <Section title="Pourquoi">
        <p>
          Uniquement pour faire fonctionner la messagerie : te connecter, livrer et afficher tes messages, t&apos;envoyer
          des notifications, protéger le service contre les abus. Rodchat ne vend pas tes données et n&apos;affiche aucune
          publicité.
        </p>
      </Section>

      <Section title="Un point important : pas de chiffrement de bout en bout">
        <p>
          Les échanges sont protégés pendant leur transport (HTTPS) et les mots de passe sont protégés par une empreinte.
          En revanche, <strong>Rodchat n&apos;est pas chiffré de bout en bout</strong> : les messages sont enregistrés sur
          les serveurs du service pour pouvoir s&apos;afficher sur tous tes appareils, et l&apos;administrateur du service
          peut techniquement y accéder. Ne partage pas d&apos;informations très sensibles (mots de passe, codes bancaires).
        </p>
      </Section>

      <Section title="Qui héberge les données">
        <p>
          Le site est hébergé par Vercel et les données sont stockées dans une base PostgreSQL fournie par Neon. Ces
          prestataires traitent les données pour le compte du service. Les appels utilisent un serveur de mise en relation
          (STUN, éventuellement TURN) : l&apos;autre participant et ce serveur peuvent voir ton adresse réseau pendant
          l&apos;appel.
        </p>
      </Section>

      <Section title="Combien de temps">
        <ul className="list-disc space-y-1 pl-5">
          <li>Messages, fichiers et conversations : jusqu&apos;à leur suppression, ou la suppression de ton compte.</li>
          <li>Messages éphémères : supprimés à l&apos;expiration de la durée choisie dans la discussion.</li>
          <li>Statuts : 24 h.</li>
          <li>Données techniques temporaires (flux temps réel, compteurs anti-abus) : de quelques minutes à une heure.</li>
        </ul>
      </Section>

      <Section title="Tes droits et tes choix">
        <ul className="list-disc space-y-1 pl-5">
          <li>Modifier ton nom, ta photo et tes infos : <em>Profil</em>.</li>
          <li>Masquer tes accusés de lecture et ta dernière connexion : <em>Paramètres</em>.</li>
          <li>Bloquer ou signaler une personne ou un message.</li>
          <li>Déconnecter tes autres appareils et changer ton mot de passe : <em>Paramètres → Compte et sécurité</em>.</li>
          <li>
            <strong>Supprimer ton compte</strong> : <em>Paramètres → Compte et sécurité → Supprimer mon compte</em>. La
            suppression est définitive : ton profil, tes discussions à deux et tes messages sont effacés.
          </li>
        </ul>
        <p>
          Pour toute demande (accès à tes données, correction, question), écris à <Contact />.
        </p>
      </Section>

      <Section title="Cookies">
        <p>
          Rodchat utilise un seul cookie, indispensable : celui qui te garde connecté. Il n&apos;y a ni cookie publicitaire
          ni outil de suivi.
        </p>
      </Section>

      <Section title="Modifications">
        <p>
          Si cette politique change de façon importante, la date en haut de page sera mise à jour et tu seras prévenu(e)
          dans l&apos;application.
        </p>
      </Section>
    </LegalPage>
  );
}
