import type { Metadata } from "next";
import LegalPage, { Contact, Section } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <LegalPage title="Conditions d'utilisation" updated="octobre 2026">
      <p>
        En créant un compte ou en utilisant Rodchat, tu acceptes ces conditions. Elles sont courtes : l&apos;idée est que
        tout le monde puisse discuter sereinement.
      </p>

      <Section title="1. Ton compte">
        <p>
          Tu es responsable de ton compte et de ton mot de passe : garde-le pour toi. Les informations que tu donnes
          doivent être exactes et tu ne dois pas te faire passer pour quelqu&apos;un d&apos;autre. Tu peux supprimer ton
          compte à tout moment depuis les paramètres.
        </p>
      </Section>

      <Section title="2. Ce qui est interdit">
        <ul className="list-disc space-y-1 pl-5">
          <li>Harceler, menacer, insulter ou discriminer.</li>
          <li>Envoyer du spam, des arnaques, des liens malveillants ou des messages en masse non sollicités.</li>
          <li>Partager des contenus illégaux ou portant atteinte à des mineurs.</li>
          <li>Partager des photos ou informations privées de quelqu&apos;un sans son accord.</li>
          <li>Perturber le service ou chercher à accéder aux comptes ou données d&apos;autres personnes.</li>
        </ul>
      </Section>

      <Section title="3. Tes contenus">
        <p>
          Tu restes propriétaire de ce que tu envoies. Tu autorises Rodchat à les enregistrer et à les transmettre à tes
          destinataires, uniquement pour faire fonctionner le service. Tu es responsable de ce que tu partages.
        </p>
      </Section>

      <Section title="4. Signalements et modération">
        <p>
          Tu peux signaler un message ou une personne. Le service peut supprimer des contenus ou suspendre des comptes qui
          ne respectent pas ces conditions, notamment en cas d&apos;abus répétés.
        </p>
      </Section>

      <Section title="5. Disponibilité">
        <p>
          Rodchat est fourni « tel quel », sans garantie de disponibilité permanente. Des interruptions ou des pertes de
          données peuvent survenir malgré les efforts apportés au service : garde une copie de ce qui est important.
          Rodchat n&apos;est pas un service d&apos;urgence : ne compte pas dessus pour appeler les secours.
        </p>
      </Section>

      <Section title="6. Responsabilité">
        <p>
          Dans les limites permises par la loi, l&apos;éditeur n&apos;est pas responsable des contenus échangés entre
          utilisateurs ni des dommages indirects liés à l&apos;utilisation du service.
        </p>
      </Section>

      <Section title="7. Modifications">
        <p>
          Ces conditions peuvent évoluer. En cas de changement important, tu en seras informé(e) et la date en haut de
          page sera mise à jour. Continuer à utiliser Rodchat vaut acceptation.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Pour toute question ou pour signaler un problème : <Contact />.
        </p>
      </Section>
    </LegalPage>
  );
}
