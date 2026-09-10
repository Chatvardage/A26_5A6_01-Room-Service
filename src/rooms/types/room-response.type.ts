export type Visibilite = 'public' | 'prive';

export interface RoomResponse {
  type: 'salon';
  id: string;
  nom: string;
  visibilite: Visibilite;
  hoteId: string;
  membreIds: string[];
  membresInvites: string[];
}
