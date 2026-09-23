export type Visibilite = 'public' | 'prive';

export interface RoomResponse {
  type: 'salon';
  id: string;
  nom: string;
  visibilite: Visibilite;
  creePar: string;
  membreIds: string[];
  membresInvites: string[];
}
