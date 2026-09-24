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

  async envoyer(
    serveurId: string,
    raison: RaisonEvenement,
    options: OptionsEvenement,
  ): Promise<void> {
    const jeton = process.env.INTERNAL_SERVICE_TOKEN?.trim();
    if (!jeton) return; // Temps réel désactivé sans secret partagé.
    const baseUrl = (
      process.env.MESSAGE_SERVICE_URL ?? 'http://localhost:3004'
    ).replace(/\/+$/, '');

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

      const reponse = await fetch(`${baseUrl}/api/internal/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': jeton,
        },
        body: JSON.stringify({
          serveurId,
          raison,
          ...(options.cibleId ? { cibleId: options.cibleId } : {}),
          ...corps,
        }),
        signal: AbortSignal.timeout(DELAI_ENVOI_MS),
      });
      if (!reponse.ok) {
        this.logger.warn(
          `Événement "${raison}" (serveur ${serveurId}) refusé par Message-Service : HTTP ${reponse.status}`,
        );
      }
    } catch (erreur) {
      const message = erreur instanceof Error ? erreur.message : String(erreur);
      this.logger.warn(
        `Événement "${raison}" (serveur ${serveurId}) non transmis : ${message}`,
      );
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
