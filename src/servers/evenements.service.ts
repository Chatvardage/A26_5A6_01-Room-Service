import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SERVEUR_PAR_DEFAUT_ID } from './default-server';

/** Raisons acceptées par Message-Service (POST /api/internal/events). */
export type RaisonEvenement =
  'modifie' | 'supprime' | 'membres' | 'expulse' | 'invitation' | 'salons';

export type OptionsEvenement = {
  /** Personne concernée (invitée, expulsée, dont le rôle change…). */
  cibleId?: string;
  /** Destinataires ; par défaut, les membres actuels du serveur. */
  destinataires?: string[];
  /** Destinataires en plus (ex. l'invité, qui n'est pas membre). */
  extras?: string[];
};

const DELAI_ENVOI_MS = 2000;
// Salons dont Message-Service efface les messages en un seul appel (borne
// de sa route interne).
export const TAILLE_LOT_SALONS = 500;

/**
 * Prévient les clients concernés, en temps réel, qu'un serveur a changé.
 * Room-Service n'a ni Redis ni Socket.IO (voir AGENTS.md) : il appelle la
 * route interne de Message-Service, qui relaie aux sockets des destinataires.
 *
 * « Tire et oublie » : `notifier` ne renvoie rien et n'échoue jamais, pour
 * qu'aucune action ne soit ralentie ni refusée à cause du temps réel. Les
 * clients qui manquent un événement se resynchronisent au rechargement.
 */
@Injectable()
export class EvenementsService {
  private readonly logger = new Logger(EvenementsService.name);

  constructor(private readonly prisma: PrismaService) {}

  notifier(
    serveurId: string,
    raison: RaisonEvenement,
    options: OptionsEvenement = {},
  ): void {
    void this.envoyer(serveurId, raison, options);
  }

  /**
   * Salons supprimés (seuls ou avec leur serveur) : Message-Service efface
   * leurs messages, qui ne seraient sinon plus jamais lus. Même principe
   * « tire et oublie » que `notifier` : un échec est journalisé.
   */
  salonsSupprimes(salonIds: string[]): void {
    void this.purgerSalons(salonIds);
  }

  async purgerSalons(salonIds: string[]): Promise<void> {
    for (let i = 0; i < salonIds.length; i += TAILLE_LOT_SALONS) {
      const lot = salonIds.slice(i, i + TAILLE_LOT_SALONS);
      try {
        await this.appeler('/api/internal/salons-supprimes', { salonIds: lot });
      } catch (erreur) {
        this.logger.warn(
          `Messages de ${lot.length} salon(s) supprimé(s) non effacés : ${messageErreur(erreur)}`,
        );
      }
    }
  }

  async envoyer(
    serveurId: string,
    raison: RaisonEvenement,
    options: OptionsEvenement,
  ): Promise<void> {
    // Temps réel désactivé sans secret partagé : pas même la lecture des
    // destinataires.
    if (!process.env.INTERNAL_SERVICE_TOKEN?.trim()) return;
    try {
      // Serveur par défaut : tout le monde en est membre. La liste de tous
      // les comptes dépasserait vite la taille maximale d'une requête : on
      // demande à Message-Service de prévenir tous les clients connectés.
      let corps: { tous: true } | { utilisateurIds: string[] };
      if (serveurId === SERVEUR_PAR_DEFAUT_ID) {
        corps = { tous: true };
      } else {
        const utilisateurIds = await this.destinataires(serveurId, options);
        if (utilisateurIds.length === 0) return;
        corps = { utilisateurIds };
      }

      await this.appeler('/api/internal/events', {
        serveurId,
        raison,
        ...(options.cibleId ? { cibleId: options.cibleId } : {}),
        ...corps,
      });
    } catch (erreur) {
      this.logger.warn(
        `Événement "${raison}" (serveur ${serveurId}) non transmis : ${messageErreur(erreur)}`,
      );
    }
  }

  /**
   * POST vers une route interne de Message-Service. Ne fait rien sans
   * INTERNAL_SERVICE_TOKEN (temps réel et purge désactivés) ; lève sur une
   * erreur réseau ou une réponse HTTP en erreur.
   */
  private async appeler(chemin: string, corps: unknown): Promise<void> {
    const jeton = process.env.INTERNAL_SERVICE_TOKEN?.trim();
    if (!jeton) return;
    const baseUrl = (
      process.env.MESSAGE_SERVICE_URL ?? 'http://localhost:3004'
    ).replace(/\/+$/, '');
    const reponse = await fetch(`${baseUrl}${chemin}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-token': jeton,
      },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(DELAI_ENVOI_MS),
    });
    if (!reponse.ok) {
      throw new Error(`refusé par Message-Service : HTTP ${reponse.status}`);
    }
  }

  /** Destinataires : ceux fournis, ou les membres actuels, plus les extras. */
  private async destinataires(
    serveurId: string,
    options: OptionsEvenement,
  ): Promise<string[]> {
    const membres =
      options.destinataires ??
      (
        await this.prisma.serverMember.findMany({
          where: { serverId: serveurId },
          select: { userId: true },
        })
      ).map((membre) => membre.userId);
    return [...new Set([...membres, ...(options.extras ?? [])])];
  }
}

function messageErreur(erreur: unknown): string {
  return erreur instanceof Error ? erreur.message : String(erreur);
}
