import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { LegalConfig } from '../../server/legal';
import { useState } from 'react';
import { Modal } from '../components/Modal';

export function LegalLinks() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="legal-links" aria-label="Informations légales">
      <Link to="/pricing">Formules</Link>
      <button className="legal-trigger" onClick={() => setOpen(true)}>
        CGU & confidentialité
      </button>
      {open && (
        <Modal title="Informations et conditions" onClose={() => setOpen(false)}>
          <p className="muted small">
            Les conditions et informations de l’éditeur sont en cours de préparation. Elles restent
            à compléter et à valider ; ce panneau ne constitue pas une acceptation contractuelle.
          </p>
          <nav className="legal-menu" aria-label="Documents légaux">
            <Link to="/legal/mentions" onClick={() => setOpen(false)}>
              Mentions légales
            </Link>
            <Link to="/legal/confidentialite" onClick={() => setOpen(false)}>
              Politique de confidentialité
            </Link>
            <Link to="/legal/cgv" onClick={() => setOpen(false)}>
              Conditions générales de vente
            </Link>
            <Link to="/legal/retractation" onClick={() => setOpen(false)}>
              Rétractation et remboursements
            </Link>
            <Link to="/billing" onClick={() => setOpen(false)}>
              Gestion des abonnements
            </Link>
          </nav>
        </Modal>
      )}
    </footer>
  );
}
export function LegalPage() {
  const { page } = useParams();
  const query = useQuery({
    queryKey: ['legal'],
    queryFn: () => api<{ configured: boolean; details: LegalConfig | null }>('/legal'),
  });
  const d = query.data?.details;
  const field = (key: keyof LegalConfig) =>
    String(d?.[key] || 'À renseigner et valider par l’éditeur');
  const titles: Record<string, string> = {
    mentions: 'Mentions légales',
    confidentialite: 'Politique de confidentialité',
    cgv: 'Conditions générales de vente',
    retractation: 'Rétractation et demandes de remboursement',
  };
  return (
    <main className="account-page legal-page">
      <Link to="/">← Le laboratoire</Link>
      <h1>{titles[page || ''] || 'Informations légales'}</h1>
      {query.error && <p role="alert">{query.error.message}</p>}
      {!query.data?.configured && (
        <p className="notice" role="status">
          Document préparatoire : les informations de l’éditeur et la validation contractuelle
          manquent. Ces pages ne constituent pas une attestation de conformité.
        </p>
      )}
      {page === 'mentions' && (
        <>
          <h2>Éditeur et contact</h2>
          <p>
            {field('publisher')} — {field('legalForm')}
            <br />
            Siège ou adresse professionnelle : {field('address')}
            <br />
            Immatriculation : {field('registration')}
            <br />
            Directeur de publication : {field('director')}
            <br />
            Contact : {field('supportEmail')}
            <br />
            Situation fiscale : {field('taxStatement')}
          </p>
          <h2>Hébergement</h2>
          <p>{field('hostingDetails')}</p>
          <p>
            Services techniques : Netlify (application et images privées), Neon (PostgreSQL et
            authentification), Stripe (paiements). Leurs informations et engagements contractuels
            doivent être vérifiés par l’éditeur.
          </p>
          <h2>Médiation de la consommation</h2>
          <p>
            {field('mediator')}
            <br />
            {field('mediatorAddress')}
            <br />
            {d?.mediatorUrl ? (
              <a href={d.mediatorUrl} rel="noreferrer">
                Site du médiateur
              </a>
            ) : (
              'Site du médiateur : à renseigner'
            )}
            . Après une réclamation écrite préalable restée sans solution, le consommateur peut
            solliciter le médiateur compétent dans les conditions légales.
          </p>
        </>
      )}
      {page === 'confidentialite' && (
        <>
          <p>
            Version : {field('privacyVersion')}. Responsable de traitement : {field('publisher')},{' '}
            {field('address')}. Contact pour vos droits : {field('privacyEmail')}.
          </p>
          <h2>Données et finalités</h2>
          <p>
            Le compte conserve nom, adresse email, identité d’authentification et sessions.
            Documents, images, versions, annotations, indices, priorités, cartes et historiques FSRS
            permettent l’écriture et la révision. Les références Stripe, statuts, échéances et
            acceptations contractuelles servent à la facturation et au contrôle des droits. Le
            contenu des documents n’est pas envoyé à Stripe. Les numéros de carte et cryptogrammes
            ne sont pas enregistrés dans notre base.
          </p>
          <p>
            Le service repose sur l’exécution du contrat pour le compte et ses fonctions, les
            obligations légales pour les pièces requises et l’intérêt légitime de sécurisation pour
            les contrôles techniques. Aucune finalité publicitaire, assistant IA ou revente de
            documents n’est prévue par cette version.
          </p>
          <h2>Destinataires et localisation</h2>
          <p>
            Neon traite l’authentification et les données PostgreSQL ; Netlify héberge
            l’application, les fonctions et les images ; Stripe traite les paiements.
            L’administration de cette version affiche les comptes, abonnements et droits, pas le
            contenu documentaire. Les accès techniques autorisés pour maintenance doivent être
            limités et encadrés.
          </p>
          <p>
            Localisation : {field('processingLocations')}
            <br />
            Transferts internationaux et garanties : {field('internationalTransfers')}
          </p>
          <h2>Conservation et copies locales</h2>
          <p>{field('retentionPolicy')}</p>
          <p>
            Les cookies de session et stockages locaux sont nécessaires à la connexion, aux
            brouillons non synchronisés et à la retransmission des notes. Des copies locales peuvent
            rester sur l’appareil après déconnexion. Sur un appareil partagé, utilisez un profil
            privé et effacez les données du site après avoir vérifié la synchronisation. Aucun
            traceur publicitaire n’est intégré à cette version.
          </p>
          <h2>Vos droits</h2>
          <p>
            Vous pouvez demander accès, rectification, effacement, limitation, opposition ou
            portabilité selon les conditions applicables, à {field('privacyEmail')}. Une
            vérification proportionnée d’identité peut être nécessaire. L’export documentaire est
            accessible depuis votre espace. Vous pouvez adresser une réclamation à la{' '}
            <a href="https://www.cnil.fr/fr/plaintes" rel="noreferrer">
              CNIL
            </a>
            . Aucune décision juridique automatisée n’est prise à partir de vos notes FSRS.
          </p>
        </>
      )}
      {page === 'cgv' && (
        <>
          <p>
            Version : {field('termsVersion')}. Vendeur : {field('publisher')}, {field('legalForm')},{' '}
            {field('address')}, {field('registration')}. Contact : {field('supportEmail')}.
          </p>
          <h2>Service, formules et commande</h2>
          <p>
            Le Laboratoire du Savant Fou permet de rédiger des documents, d’annoter des textes à
            trous et de réviser avec FSRS. La <Link to="/pricing">page des formules</Link> décrit
            les plafonds applicables. Le moteur d’édition n’est pas une garantie de fidélité
            parfaite à Google Docs ou Word : pagination visuelle, impression PDF et conversions DOCX
            ont les limites documentées dans l’application et le dépôt.
          </p>
          <p>
            Gratuit : 0 €. Pro : 9 € par mois TTC. Premium : 19 € par mois TTC, sous réserve de la
            validation fiscale de l’éditeur. Les liens de paiement sont ceux fournis par l’éditeur.
            Leur rattachement automatique aux comptes n’est pas encore actif. Le propriétaire
            bénéficie de Premium sans facturation.
          </p>
          <p>
            Vérifiez le récapitulatif Stripe avant de payer. Cette version ouvre des liens de
            paiement externes et ne recueille pas encore l’acceptation de conditions définitives. Un
            paiement ou un retour du navigateur ne suffit pas à activer des droits dans
            l’application. Les justificatifs et les futures conditions acceptées doivent être
            conservés.
          </p>
          <h2>Renouvellement, modification et résiliation</h2>
          <p>
            L’abonnement est mensuel et se renouvelle automatiquement, sans durée minimale au-delà
            de la période payée. Le portail sécurisé permet de mettre à jour le moyen de paiement,
            consulter les factures, demander un changement de formule et résilier. Les conséquences
            financières et éventuels proratas sont affichés avant confirmation. La baisse de formule
            doit être configurée pour la fin de période ; la hausse peut entraîner une facture
            immédiate à accepter.
          </p>
          <p>
            <Link to="/billing">Résilier en ligne</Link> : connectez-vous, ouvrez le portail et
            confirmez la résiliation. L’accès payé reste disponible jusqu’à l’échéance affichée. Un
            impayé, une suspension ou une expiration suspend les droits payants après
            synchronisation. Les documents et révisions ne sont pas supprimés ; au-delà du quota
            gratuit, seuls les ajouts sont bloqués, pas la lecture, l’édition ou l’export des
            données conservées.
          </p>
          <h2>Rétractation, réclamations et garanties</h2>
          <p>
            Le consommateur dispose en principe de 14 jours à compter de la conclusion du contrat
            pour se rétracter. Une demande d’accès immédiat est recueillie séparément et ne vaut pas
            renonciation automatique. Aucun mécanisme de renonciation ou retenue proportionnelle
            automatique n’est activé par cette version. Voir le{' '}
            <Link to="/legal/retractation">formulaire et les modalités de demande</Link>.
          </p>
          <p>
            Les garanties légales applicables aux contenus et services numériques, notamment la
            conformité et les mises à jour nécessaires, demeurent applicables ; aucune clause de
            cette page ne les exclut. En cas de défaut ou réclamation, contactez{' '}
            {field('supportEmail')}. Les procédures et délais obligatoires doivent être vérifiés par
            l’éditeur avant ouverture commerciale.
          </p>
          <p>
            Le droit français s’applique, sans priver le consommateur de ses protections
            impératives. Médiateur : {field('mediator')}, {field('mediatorAddress')}. Les voies de
            recours ordinaires restent ouvertes ; aucune juridiction exclusive n’est imposée au
            consommateur.
          </p>
        </>
      )}
      {page === 'retractation' && (
        <>
          <p>
            Pour demander une rétractation, adressez une déclaration non équivoque dans le délai
            légal à {field('withdrawalAddress')} ou {field('supportEmail')}. La simple résiliation
            du renouvellement dans Stripe ne remplace pas une demande de rétractation et n’entraîne
            pas automatiquement un remboursement.
          </p>
          <h2>Modèle à compléter</h2>
          <blockquote>
            À l’attention de {field('publisher')}, {field('withdrawalAddress')} :<br />
            Je vous notifie ma rétractation du contrat portant sur l’abonnement au Laboratoire du
            Savant Fou, conclu le [date].
            <br />
            Nom et prénom : […]
            <br />
            Adresse : […]
            <br />
            Email du compte et référence de commande : […]
            <br />
            Date : […]
            <br />
            Signature (uniquement sur papier) : […]
          </blockquote>
          <p>
            La demande est traitée après vérification du contrat. En cas de rétractation applicable,
            le remboursement intervient selon les délais et modalités légaux, sans prétendre qu’un
            paiement réel a été testé. Les coordonnées ci-dessus doivent être validées avant
            ouverture des ventes.
          </p>
        </>
      )}
      <LegalLinks />
    </main>
  );
}
