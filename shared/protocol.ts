/**
 * Signaling protocol shared by the Electron main process (server) and the renderer (client).
 * The signaling server only ever carries small JSON messages: presence, chat text and the
 * SDP/ICE handshake. Audio, video and screen frames never touch it — they flow peer to peer.
 */

export type ChannelKind = "text" | "voice";

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
}

export interface ServerInfo {
  id: string;
  name: string;
  channels: Channel[];
}

export interface MediaState {
  muted: boolean;
  deafened: boolean;
  camera: boolean;
  sharing: boolean;
}

export interface Profile {
  name: string;
  hue: number; // avatar / name color
  bio: string;
  avatar: string | null; // small data:image URL (≤ 128 px), shared with everyone in the server
  banner: string; // hex color
}

export interface Member extends Profile {
  id: string;
  host: boolean; // runs the server on their PC (can disconnect people from voice)
  state: MediaState;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorHue: number;
  text: string;
  at: number;
}

/** Opaque WebRTC handshake payload relayed between two peers. */
export type SignalData =
  | { description: { type: "offer" | "answer"; sdp: string } }
  | { candidate: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null } }
  | { restart: true };

export type ClientMessage =
  | ({ t: "hello"; key: string; hostToken?: string } & Profile)
  | ({ t: "profile" } & Profile)
  | { t: "kick_voice"; id: string }
  | { t: "join_voice"; channelId: string }
  | { t: "leave_voice" }
  | { t: "state"; state: MediaState }
  | { t: "signal"; to: string; data: SignalData }
  | { t: "chat"; channelId: string; text: string };

export type ServerMessage =
  | {
      t: "welcome";
      selfId: string;
      server: ServerInfo;
      members: Member[];
      voice: Record<string, string[]>;
      history: Record<string, ChatMessage[]>;
    }
  | { t: "member_join"; member: Member }
  | { t: "member_leave"; id: string }
  | { t: "member_state"; id: string; state: MediaState }
  | { t: "member_profile"; member: Member }
  | { t: "server_update"; server: ServerInfo }
  | { t: "voice"; voice: Record<string, string[]> }
  | { t: "signal"; from: string; data: SignalData }
  | { t: "chat"; message: ChatMessage }
  | { t: "error"; message: string };

export const DEFAULT_PORT = 4646;
export const SIGNAL_PATH = "/signal";
export const MAX_MESSAGE_BYTES = 256 * 1024; // SDP + candidates stay far below this
export const MAX_CHAT_LENGTH = 2000;
export const MAX_AVATAR_CHARS = 120_000; // ~90 KB image as base64
export const MAX_BIO_LENGTH = 190;
export const NO_MEDIA: MediaState = { muted: false, deafened: false, camera: false, sharing: false };
